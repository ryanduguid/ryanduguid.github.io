// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for the portable long service leave levy calculator. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

/** @param {ToolKit} kit @param {Pick<BusinessCalculators, 'portableLslLevy' | 'PLSL_YEARS'>} calculate */
export function portableLslLevyTool(kit, calculate) {
  const { text, choice, record, tool, CALCULATORS } = kit;
  const years = calculate.PLSL_YEARS;
  return tool({
    name: 'calculate_portable_lsl_levy',
    title: 'Portable long service leave levy calculator',
    description: `A state or territory portable long service leave levy in AUD for ${years.at(-1)} to ${years[0]}, as each board sets it: `
      + 'NSW (0.25% from $250,000, rounded down to the dollar), Queensland (0.575% from $150,000 in 3 parts, each to the dollar with 50c down) and NT '
      + '(0.1% from $1 million to $5 billion) construction on the project cost; Victoria, SA, WA, ACT and Tasmania construction and the community services, '
      + 'contract cleaning and security schemes on ordinary wages, half up to the cent. Each scheme has the years its rate was read for; others are refused. '
      + 'It does not decide coverage, ordinary pay, apprentice exemptions or project exemptions. Coal LSL is calculate_coal_lsl_levy.',
    inputSchema: record({
      incomeYear: choice([...years], `Financial year, ${years.at(-1)} to ${years[0]}.`),
      jurisdiction: choice(['nsw', 'vic', 'qld', 'sa', 'wa', 'act', 'tas', 'nt'], 'State or territory.'),
      scheme: choice(['construction', 'community_services', 'contract_cleaning', 'security'], 'Industry scheme.'),
      ordinaryWages: text('trillionCost', 'Ordinary wages for the return in AUD; for every scheme but NSW, Queensland and NT construction.'),
      projectCost: text('trillionCost', 'Cost of the building or construction work in AUD; for NSW (including GST), Queensland (excluding GST) and NT construction.'),
      paidOnTime: { type: 'boolean', description: 'Tasmania construction only: true when the return is lodged and paid by the due dates (1.8%), false for 2.5%.' },
      partialExemption: { type: 'boolean', description: 'NSW, Queensland or NT construction: true when a partial or special exemption applies, which is refused; false when omitted.' },
    }, ['incomeYear', 'jurisdiction', 'scheme']),
    run(input) {
      /** @type {Record<string, unknown>} */
      const call = { jurisdiction: input.jurisdiction, scheme: input.scheme, year: input.incomeYear, scope_confirmed: true };
      for (const [from, to] of [['ordinaryWages', 'ordinary_wages'], ['projectCost', 'project_cost'], ['paidOnTime', 'paid_on_time'], ['partialExemption', 'partial_exemption']]) {
        if (input[from] !== undefined) call[to] = input[from]; // eslint-disable-line security/detect-object-injection -- from and to are this tool's own input and the command's names
      }
      const r = calculate.portableLslLevy(call);
      return { incomeYear: r.period, jurisdiction: r.jurisdiction, scheme: r.scheme, basis: r.basis, board: r.authority_board, levy: r.amounts.levy,
        amounts: r.amounts, rates: r.rates, steps: r.steps, currency: 'AUD', source: `${CALCULATORS}portable-lsl-levy/` };
    },
  });
}
