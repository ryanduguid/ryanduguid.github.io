// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for the undeducted purchase price of a foreign pension. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {{FOREIGN_PENSION_YEARS: string[],
 *   foreignPensionUpp: typeof import('./foreign-pension-upp.mjs').foreignPensionUpp}} ForeignPensionEngine */

/** The command's call from the tool's input, leaving out what was not given. @param {Record<string, any>} i */
function commandCall(i) {
  /** @type {Record<string, unknown>} */
  const call = { method: i.method, year: i.incomeYear, scope_confirmed: true, annuity_derived: i.annuityDerived };
  const number = i.relevantNumberBasis === undefined && i.relevantNumber === undefined ? undefined
    : { basis: i.relevantNumberBasis, years: i.relevantNumber };
  const optional = { undeducted_purchase_price: i.undeductedPurchasePrice, residual_capital_value: i.residualCapitalValue,
    relevant_number: number, total_annuity_derived: i.totalAnnuityDerived, commuted: i.commuted, whole_year: i.wholeYear,
    uk_category: i.ukCategory };
  for (const [key, value] of Object.entries(optional)) if (value !== undefined) call[key] = value; // eslint-disable-line security/detect-object-injection -- keys are the fixed names above
  return call;
}

/** @param {ToolKit} kit @param {ForeignPensionEngine} engine */
export function foreignPensionTool(kit, { FOREIGN_PENSION_YEARS, foreignPensionUpp }) {
  const { text, choice, record, tool, INDIVIDUAL } = kit;
  return tool({
    name: 'calculate_foreign_pension_upp',
    title: 'Foreign pension undeducted purchase price',
    description: 'Works the deductible amount of the undeducted purchase price of a foreign pension or annuity, in AUD: ITAA 1936 '
      + `s 27H(2), relevant share x (purchase price - residual capital value) / relevant number, for ${FOREIGN_PENSION_YEARS[0]} to `
      + `${FOREIGN_PENSION_YEARS.at(-1)}; or for 2025-26 the ATO D11 shortcuts (8% of a UK State Pension category A or B widow's `
      + 'pension, nil for C or D, 25% of a Dutch SVB pension whose amount cannot be determined). The amount excluded is at most the '
      + 'pension. A commuted annuity, part of a year and a relevant number the Commissioner must set are refused (NAT 16543).',
    inputSchema: record({
      incomeYear: choice(FOREIGN_PENSION_YEARS, `Income year, ${FOREIGN_PENSION_YEARS[0]} to ${FOREIGN_PENSION_YEARS.at(-1)}.`),
      method: choice(['formula', 'uk_state_pension', 'dutch_svb_fallback'], 'formula (s 27H), or uk_state_pension or dutch_svb_fallback (2025-26 only).'),
      annuityDerived: text('trillionCost', 'Pension or annuity derived in the year, AUD.'),
      undeductedPurchasePrice: text('trillionCost', 'formula: the undeducted purchase price, AUD.'),
      residualCapitalValue: text('trillionCost', 'formula: the residual capital value, AUD; 0 if none.'),
      relevantNumberBasis: choice(['term_years', 'life_expectation_factor'], 'formula: a term of years certain or a life expectation factor.'),
      relevantNumber: text('rate', 'formula: the term in years or the life expectation factor, above 0.'),
      totalAnnuityDerived: text('trillionCost', 'formula, optional: the whole annuity derived by you and those it is shared with, AUD.'),
      commuted: { type: 'boolean', description: 'formula: part of the annuity has been commuted (refused).' },
      wholeYear: { type: 'boolean', description: 'formula: the annuity was derived for the whole income year (false is refused).' },
      ukCategory: choice(['a', 'b_widow', 'c', 'd'], 'uk_state_pension: the UK State Pension category.'),
    }, ['incomeYear', 'method', 'annuityDerived']),
    run(input) {
      const r = foreignPensionUpp(commandCall(input));
      const a = r.amounts;
      return { incomeYear: r.period, method: r.rates.method, deductibleAmount: a.deductible_amount, excludedAmount: a.excluded_amount,
        assessableAmount: a.assessable_amount, rates: r.rates, source: `${INDIVIDUAL}foreign-pension-upp/` };
    },
  });
}
