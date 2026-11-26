// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for the HELP indexation calculator. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {{HELP_INDEXATION_YEARS: string[], MAX_ENTRIES: number,
 *   helpIndexation: typeof import('./help-indexation.mjs').helpIndexation}} HelpIndexationEngine */

/** The tool's optional amounts and the command inputs they fill. */
const AMOUNTS = [['compulsoryRepayments', 'compulsory_repayments'], ['assessmentIncreases', 'assessment_increases'],
  ['assessmentReductions', 'assessment_reductions'], ['currentRepayments', 'current_repayments'], ['proposedRepayment', 'proposed_repayment']];

/** @param {ToolKit} kit @param {HelpIndexationEngine} engine */
export function helpIndexationTool(kit, { HELP_INDEXATION_YEARS, MAX_ENTRIES, helpIndexation }) {
  const { text, choice, record, tool, INDIVIDUAL } = kit;
  const debt = record({
    incurred: text('date', 'Day the debt was incurred (the unit’s census date), YYYY-MM-DD.'),
    amount: text('trillionCost', 'The debt in AUD as incurred, before any 20% reduction.'),
    group: { type: 'string', description: 'Course and provider the debt belongs to; required when a list has several debts.' },
  }, ['incurred', 'amount']);
  const repayment = record({
    date: text('date', 'Day the voluntary repayment was made, YYYY-MM-DD.'),
    amount: text('trillionCost', 'The repayment in AUD.'),
  }, ['date', 'amount']);
  const list = (/** @type {object} */ items, /** @type {string} */ description) => ({ type: 'array', maxItems: MAX_ENTRIES, items, description });
  const amounts = Object.fromEntries(AMOUNTS.map(([name]) => [name, text('trillionCost', `Optional ${name} in AUD; see the description.`)]));
  return tool({
    name: 'calculate_help_indexation',
    title: 'HELP indexation calculator',
    description: 'Works out the accumulated HELP debt in AUD on 1 June at the end of an income year ('
      + `${HELP_INDEXATION_YEARS.at(-1)} to ${HELP_INDEXATION_YEARS[0]}) under HESA s 140-5 steps 1 to 6: the previous 1 June debt, `
      + 'plus debts incurred 1 January to 30 June of the preceding year (each group cut to whole dollars), less voluntary repayments '
      + 'from the previous 1 June to 31 May, compulsory repayments assessed and amendment increases, plus amendment reductions, '
      + 'times the indexation factor (lower of CPI and WPI from 2022-23), plus debts incurred 1 July to 31 December less their '
      + 'repayments; cents dropped. For 2024-25 the 20% reduction of s 140-26 applies, and s 137-19A cuts debts incurred 1 January to '
      + '1 June 2025: give every amount unreduced. With proposedRepayment it compares paying before and on or after 1 June. '
      + 'Excludes location-preferred HELP debtors and loans indexed under other Acts.',
    inputSchema: record({
      incomeYear: choice(HELP_INDEXATION_YEARS, 'Income year whose 1 June is the indexation day, such as 2025-26 for 1 June 2026.'),
      previousAccumulatedDebt: text('trillionCost', 'Accumulated HELP debt on the previous 1 June in AUD (0 for none), as the ATO account shows it.'),
      earlierDebts: list(debt, 'Debts incurred 1 January to 30 June of the preceding income year.'),
      currentDebts: list(debt, 'Debts incurred 1 July to 31 December of the income year.'),
      voluntaryRepayments: list(repayment, 'Voluntary repayments made from the previous 1 June to 31 May.'),
      ...amounts,
      scopeConfirmed: { type: 'boolean', description: 'Optional scope confirmation; false refuses.' },
    }, ['incomeYear', 'previousAccumulatedDebt']),
    run({ incomeYear, previousAccumulatedDebt, earlierDebts, currentDebts, voluntaryRepayments, scopeConfirmed = true, ...rest }) {
      const given = new Map(Object.entries(rest));
      /** @type {Record<string, unknown>} */
      const input = { location_preferred: false, year: incomeYear, scope_confirmed: scopeConfirmed, previous_accumulated_debt: previousAccumulatedDebt };
      const lists = [['earlier_debts', earlierDebts], ['current_debts', currentDebts], ['voluntary_repayments', voluntaryRepayments]];
      for (const [key, value] of [...lists, ...AMOUNTS.map(([name, key]) => [key, given.get(name)])]) {
        if (value !== undefined) input[key] = value; // eslint-disable-line security/detect-object-injection -- key is one of this tool's own command names
      }
      const r = helpIndexation(input);
      return { incomeYear: r.year, indexationDate: r.indexationDate, amounts: r.amounts, rates: r.rates, currency: 'AUD',
        source: `${INDIVIDUAL}help-indexation/` };
    },
  });
}
