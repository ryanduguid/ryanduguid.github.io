// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP for the S6 pages: the blackhole expenditure tool, and the company tax tool's optional return statement.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

const STATEMENT_YEARS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];

/** The company tax tool's `returnStatement` input. @param {ToolKit} kit */
export function statementSchema(kit) {
  const { text, choice, whole, record } = kit;
  const aud = (/** @type {string} */ what) => text('trillionCost', `${what} in AUD; "0" when omitted.`);
  const loss = record({
    lossYear: whole(2000, 2026, 'The income year the loss was incurred, as the calendar year it ends (2024 for 2023-24).'),
    amount: text('trillionCost', 'The loss still unused, in AUD.'),
    test: choice(['continuity_of_ownership', 'same_business', 'similar_business', 'failed', 'part_year'],
      'The stated outcome of the loss tests (ss 165-12, 165-13, 165-211); "failed" deducts none; "part_year" (s 165-20) is refused.'),
  }, ['lossYear', 'amount', 'test']);
  const lossCarryBack = record({
    frankingAccountBalance: text('trillionCost', 'Franking account balance at the end of the claim year in AUD.'),
    conditionsMet: { type: 'boolean', description: 'true when every Division 160 condition for the claim year is met; false refuses.' },
    carryBacks: { type: 'array', maxItems: 20, description: 'Each loss carried back: lossYear and earlierYear as calendar years ending, and the amount.',
      items: record({ lossYear: whole(2020, 2027, 'Loss year (calendar year it ends).'), earlierYear: whole(2019, 2026, 'Earlier year (calendar year it ends).'),
        amount: text('trillionCost', 'Amount carried back in AUD.') }, ['lossYear', 'earlierYear', 'amount']) },
    earlierYears: { type: 'array', maxItems: 20, description: 'Each earlier year carried back to.',
      items: record({ year: whole(2019, 2026, 'Calendar year it ends.'), incomeTaxLiability: text('trillionCost', 'Income tax liability in AUD.'),
        liabilityPreviouslyUsed: text('trillionCost', 'Liability used by earlier carry backs in AUD.'),
        netExemptIncome: aud('Net exempt income') }, ['year', 'incomeTaxLiability', 'liabilityPreviouslyUsed']) },
    lossYears: { type: 'array', maxItems: 20, description: 'Loss years before the claim year (former Division 160 only), each with its rate facts.',
      items: record({ year: whole(2020, 2026, 'Calendar year it ends.'), taxLoss: text('trillionCost', 'Tax loss in AUD.'),
        aggregatedTurnover: text('trillionCost', 'Aggregated turnover in AUD.'), assessableIncome: text('trillionCost', 'Assessable income in AUD.'),
        passiveIncome: text('trillionCost', 'Base rate entity passive income in AUD.') },
      ['year', 'taxLoss', 'aggregatedTurnover', 'assessableIncome', 'passiveIncome']) },
  }, ['frankingAccountBalance', 'conditionsMet', 'carryBacks', 'earlierYears']);
  return record({
    incomeYear: choice(STATEMENT_YEARS, 'Income year of the return, 2020-21 to 2026-27.'),
    deductions: text('trillionCost', 'Deductions for the year, prior-year losses not included, in AUD.'),
    netExemptIncome: aud('Net exempt income'),
    priorYearLosses: { type: 'array', maxItems: 30, items: loss, description: 'Prior-year tax losses, each loss year once.' },
    lossDeductionChosen: text('trillionCost', 'The loss deduction chosen under s 36-17; the most allowed when omitted.'),
    nonRefundableNonCarryForwardOffsets: aud('Label C offsets'), frankingTaxOffsets: aud('Franking tax offsets within label C'),
    nonRefundableCarryForwardOffsets: aud('Label D offsets'), refundableTaxOffsets: aud('Label E offsets other than loss carry back'),
    frankingDeficitTaxOffset: aud('Label F offset'), section102aamInterest: aud('Label G interest charge'),
    eligibleCredits: aud('Label H credits'), paygInstalments: aud('Label K instalments'),
    lossCarryBack,
  }, ['incomeYear', 'deductions']);
}

const CONDITIONS = {
  temporary: ['corporate_tax_entity_throughout', 'returns_lodged', 'choice_in_approved_form', 'carried_on_business_each_loss_year',
    'no_transferred_losses', 'no_excess_franking_offset_losses', 'no_integrity_scheme'],
  permanent: ['corporate_tax_entity_throughout', 'not_significant_global_entity', 'returns_lodged', 'choice_in_approved_form',
    'no_transferred_losses', 'no_excess_franking_offset_losses', 'no_integrity_scheme'],
};

/** The command's call from the tool's statement and the company's figures. @param {Record<string, any>} st @param {Record<string, any>} input */
export function statementCall(st, input) {
  const fy = Number(st.incomeYear.slice(0, 4)) + 1;
  /** @type {Record<string, unknown>} */
  const call = { financial_year: fy, aggregated_turnover: input.turnover, assessable_income: input.assessableIncome,
    passive_income: input.passiveIncome, deductions: st.deductions, net_exempt_income: st.netExemptIncome ?? '0',
    prior_year_losses: (st.priorYearLosses ?? []).map((/** @type {Record<string, any>} */ l) => ({ loss_year: l.lossYear, amount: l.amount, test: l.test })),
    non_refundable_non_carry_forward_offsets: st.nonRefundableNonCarryForwardOffsets ?? '0', franking_tax_offsets: st.frankingTaxOffsets ?? '0',
    non_refundable_carry_forward_offsets: st.nonRefundableCarryForwardOffsets ?? '0', refundable_tax_offsets: st.refundableTaxOffsets ?? '0',
    franking_deficit_tax_offset: st.frankingDeficitTaxOffset ?? '0', section_102aam_interest: st.section102aamInterest ?? '0',
    eligible_credits: st.eligibleCredits ?? '0', payg_instalments: st.paygInstalments ?? '0' };
  if (st.lossDeductionChosen !== undefined) call.loss_deduction_chosen = st.lossDeductionChosen;
  const lcb = st.lossCarryBack;
  if (lcb) {
    call.loss_carry_back = { franking_account_balance: lcb.frankingAccountBalance,
      conditions: Object.fromEntries((fy === 2027 ? CONDITIONS.permanent : CONDITIONS.temporary).map((key) => [key, lcb.conditionsMet])),
      carry_backs: lcb.carryBacks.map((/** @type {Record<string, any>} */ c) => ({ loss_year: c.lossYear, earlier_year: c.earlierYear, amount: c.amount })),
      earlier_years: lcb.earlierYears.map((/** @type {Record<string, any>} */ e) => ({ year: e.year, income_tax_liability: e.incomeTaxLiability,
        liability_previously_used: e.liabilityPreviouslyUsed, net_exempt_income: e.netExemptIncome ?? '0' })),
      loss_years: (lcb.lossYears ?? []).map((/** @type {Record<string, any>} */ l) => ({ year: l.year, tax_loss: l.taxLoss,
        aggregated_turnover: l.aggregatedTurnover, assessable_income: l.assessableIncome, passive_income: l.passiveIncome })) };
  }
  return call;
}

/** @param {ToolKit} kit @param {BusinessCalculators['businessCapitalExpenditure']} run @param {readonly string[]} years */
export function blackholeTool(kit, run, years) {
  const { text, choice, record, tool, CALCULATORS } = kit;
  const item = record({
    amount: text('trillionCost', 'The capital expenditure in AUD.'),
    incurredIn: choice([...years], 'Income year incurred, from 2020-21.'),
    business: choice(['current', 'former', 'proposed', 'wind_up'], 'The business it relates to (s 40-880(2)(a) to (d)).'),
    carriedOnBy: choice(['you', 'another_entity'], 'Former or proposed business only: who carried it on or proposes to.'),
    assessableIncomeConnection: { type: 'boolean', description: 'Another entity\'s business or a wind-up only: in connection with deriving your assessable income from it (s 40-880(4)(b)).' },
    withinReasonableTime: { type: 'boolean', description: 'Proposed business only: reasonable to conclude it will start within a reasonable time (s 40-880(7)).' },
    startUpExpense: choice(['advice_or_services', 'government_fees', 'neither'], 'Proposed business only: the s 40-880(2A)(b) kind.'),
    entityTest: choice(['small_business_entity', 'covered_by_2b', 'not_in_business_and_unconnected', 'none'], 'Start-up cost only: the s 40-880(2A)(c) entity.'),
    taxablePurpose: text('share', 'Taxable purpose of the business from 0 to 1, for example "0.8".'),
    exclusions: { type: 'array', maxItems: 13, description: 'Paragraphs of s 40-880 that exclude it: "5(a)" to "5(j)", "8", "9(a)", "9(b)"; [] when omitted.',
      items: choice(['5(a)', '5(b)', '5(c)', '5(d)', '5(e)', '5(f)', '5(g)', '5(h)', '5(i)', '5(j)', '8', '9(a)', '9(b)'], 'A paragraph of s 40-880.') },
    goodwillRight: { type: 'boolean', description: 'With 5(d) or 5(f) only: s 40-880(6) applies (it preserves goodwill through a right valued only for that).' },
    capital: { type: 'boolean', description: 'true (the default) when the outlay is capital; false refuses.' },
  }, ['amount', 'incurredIn', 'business', 'taxablePurpose']);
  return tool({
    name: 'calculate_blackhole_expenditure',
    title: 'Blackhole expenditure calculator',
    description: `Business capital (blackhole) expenditure deductions in AUD under ITAA 1997 s 40-880 for ${years[0]} to ${years.at(-1)}: `
      + 'each item to the extent of its taxable purpose, a fifth a year over 5 income years from the year incurred (s 40-880(2)), or all at '
      + 'once as a start-up cost of a proposed business (s 40-880(2A) and (2B)); nil when s 40-880(4)(b), (5), (7), (8) or (9) excludes it. '
      + 'Refuses s 40-880(5)(a) and (f) items and expenditure incurred before 1 July 2020. Facts are stated, not judged.',
    inputSchema: record({
      incomeYear: choice([...years], `Income year to work out, ${years[0]} to ${years.at(-1)}.`),
      items: { type: 'array', maxItems: 100, items: item, description: 'From 1 to 100 items of capital expenditure.' },
    }, ['incomeYear', 'items']),
    run(input) {
      const items = input.items.map((/** @type {Record<string, any>} */ it) => {
        /** @type {Record<string, unknown>} */
        const call = { amount: it.amount, incurred_in: it.incurredIn, capital: it.capital ?? true, business: it.business };
        for (const [from, to] of [['carriedOnBy', 'carried_on_by'], ['assessableIncomeConnection', 'assessable_income_connection'],
          ['withinReasonableTime', 'within_reasonable_time'], ['startUpExpense', 'start_up_expense'], ['entityTest', 'entity_test']]) {
          if (it[from] !== undefined) call[to] = it[from]; // eslint-disable-line security/detect-object-injection -- keys are this module's own constants
        }
        call.taxable_purpose = it.taxablePurpose;
        call.exclusions = it.exclusions ?? [];
        if (it.goodwillRight !== undefined) call.goodwill_right = it.goodwillRight;
        return call;
      });
      const r = run({ items, year: input.incomeYear, scope_confirmed: true });
      return { incomeYear: r.period, deduction: r.amounts.deduction, remainingAfterYear: r.amounts.remaining_expenditure_after_year,
        deductibleExpenditure: r.amounts.deductible_expenditure, expenditure: r.amounts.expenditure, items: r.items, amounts: r.amounts,
        currency: 'AUD', source: `${CALCULATORS}blackhole-expenditure/` };
    },
  });
}

/** The S6 tools, keyed by each form's `data-calculator` slug. @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'businessCapitalExpenditure' | 'BLACKHOLE_YEARS'>} calculate */
export function businessS6Tools(kit, calculate) {
  return { 'blackhole-expenditure': blackholeTool(kit, calculate.businessCapitalExpenditure, calculate.BLACKHOLE_YEARS) };
}
