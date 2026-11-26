// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for the business calculators added on 26 November 2026: the instant asset
// write-off. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

/** @param {ToolKit} kit @param {BusinessCalculators['instantAssetWriteOff']} instantAssetWriteOff @param {readonly string[]} years */
export function instantAssetWriteOffTool(kit, instantAssetWriteOff, years) {
  const { text, choice, record, tool, CALCULATORS } = kit;
  return tool({
    name: 'calculate_instant_asset_write_off',
    title: 'Instant asset write-off calculator',
    description: 'Whether one depreciating asset is written off in full in AUD in the income year it is first used or '
      + `installed ready for use, ${years[0]} to ${years.at(-1)}: a small business entity using simplified depreciation `
      + '(ITAA 1997 s 328-180, IT(TP)A 1997 ss 328-180 and 328-181: $1,000, $150,000, $20,000 or no limit by the dates, '
      + '$20,000 from 1 July 2026) or a medium sized business (s 40-82, $150,000 to 30 June 2021). Gives the taxable '
      + 'purpose proportion of the cost, the deduction, the cost limit and its rule. Refuses an asset acquired on a '
      + 'budget day and, for other entities, an asset temporary full expensing may cover.',
    inputSchema: record({
      incomeYear: choice([...years], `Income year the asset is first used, ${years[0]} to ${years.at(-1)}.`),
      entity: choice(['small_business_simplified', 'medium_business', 'other'], '"small_business_simplified", "medium_business" or "other".'),
      acquired: text('date', 'Date first acquired, YYYY-MM-DD.'),
      firstUsed: text('date', 'Date first used or installed ready for use for a taxable purpose, YYYY-MM-DD, inside incomeYear.'),
      cost: text('trillionCost', 'The asset\'s whole cost in AUD.'),
      taxableUse: text('share', 'Share of use for a taxable purpose, from 0 to 1, for example "0.8".'),
      scopeConfirmed: { type: 'boolean', description: 'Optional scope confirmation; false refuses.' },
    }, ['incomeYear', 'entity', 'acquired', 'firstUsed', 'cost', 'taxableUse']),
    run(input) {
      const r = instantAssetWriteOff({ entity: input.entity, acquired: input.acquired, first_used: input.firstUsed, cost: input.cost,
        taxable_use: input.taxableUse, year: input.incomeYear, scope_confirmed: input.scopeConfirmed ?? true });
      return { incomeYear: r.year, writtenOff: r.written, taxablePurposeCost: r.amounts.taxable_purpose_cost,
        deduction: r.amounts.deduction, costLimit: r.limit, costLimitRule: r.rule, warnings: r.warnings, currency: 'AUD',
        source: `${CALCULATORS}instant-asset-write-off/` };
    },
  });
}

/**
 * The business calculators added 26 November 2026, keyed by each form's `data-calculator` slug.
 * @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'instantAssetWriteOff' | 'IAWO_YEARS'>} calculate
 */
export function businessS1Tools(kit, calculate) {
  return {
    'instant-asset-write-off': instantAssetWriteOffTool(kit, calculate.instantAssetWriteOff, calculate.IAWO_YEARS),
  };
}
