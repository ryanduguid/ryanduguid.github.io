// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for the defined benefit income cap. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {{DB_INCOME_CAP_YEARS: string[],
 *   definedBenefitIncomeCap: typeof import('./defined-benefit-income-cap.mjs').definedBenefitIncomeCap}} DbIncomeCapEngine */

/** @param {ToolKit} kit @param {DbIncomeCapEngine} engine */
export function dbIncomeCapTool(kit, { DB_INCOME_CAP_YEARS, definedBenefitIncomeCap }) {
  const { text, choice, record, tool, INDIVIDUAL } = kit;
  const years = `${DB_INCOME_CAP_YEARS[0]} to ${DB_INCOME_CAP_YEARS.at(-1)}`;
  return tool({
    name: 'calculate_defined_benefit_income_cap',
    title: 'Defined benefit income cap',
    description: `Works the defined benefit income cap (ITAA 1997 s 303-4) for ${years}: the general transfer balance cap / 16, `
      + 'rounded up to the dollar, pro-rated from a first day in the year and reduced by defined benefit income without concessional '
      + 'treatment; then 50% of the tax free components and taxed elements over the cap as assessable income (s 303-2) and the 10% '
      + 'untaxed element offset less 10% of the excess (s 303-3), in AUD. The stated amounts are taken as concessionally treated '
      + '(age 60 or over, or a death benefit); Schedule 13 withholding is not worked.',
    inputSchema: record({
      incomeYear: choice(DB_INCOME_CAP_YEARS, `Income year, ${years}.`),
      taxFreeAndTaxed: text('trillionCost', 'Tax free components and taxed elements of concessional defined benefit income in the year, AUD.'),
      untaxed: text('trillionCost', 'Untaxed elements of concessional defined benefit income in the year, AUD.'),
      otherDefinedBenefitIncome: text('trillionCost', 'Defined benefit income without concessional treatment, which reduces the cap, AUD.'),
      firstDay: text('date', 'Optional: the day in the income year the concessional treatment first applied, YYYY-MM-DD.'),
    }, ['incomeYear', 'taxFreeAndTaxed', 'untaxed', 'otherDefinedBenefitIncome']),
    run({ incomeYear, taxFreeAndTaxed, untaxed, otherDefinedBenefitIncome, firstDay }) {
      const r = definedBenefitIncomeCap({ year: incomeYear, scope_confirmed: true, tax_free_and_taxed: taxFreeAndTaxed, untaxed,
        other_defined_benefit_income: otherDefinedBenefitIncome, ...(firstDay === undefined ? {} : { first_day: firstDay }) });
      const a = r.amounts;
      return { incomeYear: r.period, unreducedCap: a.unreduced_cap, cap: a.defined_benefit_income_cap, excessOverCap: a.excess_over_cap,
        assessableIncome: a.assessable_income, untaxedOffsetBeforeReduction: a.untaxed_offset_before_reduction,
        offsetReduction: a.offset_reduction, untaxedOffset: a.untaxed_offset, source: `${INDIVIDUAL}defined-benefit-income-cap/` };
    },
  });
}
