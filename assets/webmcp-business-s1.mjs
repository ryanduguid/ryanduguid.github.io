// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for the business calculators added on 26 November 2026: the instant asset
// write-off and leave provisions. Imported by assets/webmcp-tools.mjs.

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

/** @param {ToolKit} kit @param {BusinessCalculators['leaveProvisions']} leaveProvisions @param {readonly string[]} years */
export function leaveProvisionsTool(kit, leaveProvisions, years) {
  const { text, choice, record, tool, CALCULATORS } = kit;
  const line = record({
    label: { type: 'string', description: 'The employee or group (1 to 200 characters, not only spaces).' },
    leave: choice(['annual', 'long_service'], '"annual" or "long_service".'),
    hours: text('trillionCost', 'Hours accrued and unused at the reporting date, at most 2 decimal places.'),
    hourlyRate: text('trillionCost', 'Hourly rate in AUD the leave would be paid at today, with any on-costs included.'),
    probability: text('share', 'Probability of payment from 0 to 1, at most 6 decimal places, for example "0.4".'),
    settledWithin12Months: { type: 'boolean', description: 'true when expected to be settled wholly within 12 months (short-term, undiscounted).' },
    yearsToSettlement: { type: 'integer', minimum: 1, maximum: 50, description: 'Long-term lines only: whole years to settlement, 1 to 50.' },
    salaryGrowth: text('share', 'Long-term lines only: salary growth a year from 0 to 1, at most 6 decimal places, for example "0.03".'),
    discountRate: text('share', 'Long-term lines only: discount rate a year from 0 to 1, at most 6 decimal places, for example "0.045".'),
    canDeferSettlement: { type: 'boolean', description: 'Long-term lines only: true when the entity has a right at the reporting date to defer settlement for at least 12 months.' },
  }, ['label', 'leave', 'hours', 'hourlyRate', 'probability', 'settledWithin12Months']);
  return tool({
    name: 'calculate_leave_provisions',
    title: 'Leave provisions calculator',
    description: `Annual and long service leave provisions in AUD at one reporting date, ${years[0]} to ${years.at(-1)}, under AASB 119 `
      + '(short-term lines undiscounted, paras 11 and 16; other long-term lines projected by salary growth, weighted by the probability '
      + 'of payment and discounted, para 155) and split current and non-current under AASB 101 para 69. The preparer states every '
      + 'assumption. Refuses defined benefit plans, plan assets and other leave or benefit types.',
    inputSchema: record({
      incomeYear: choice([...years], `Financial year of the reporting date, ${years[0]} to ${years.at(-1)}.`),
      lines: { type: 'array', maxItems: 500, items: line, description: 'From 1 to 500 lines.' },
      scopeConfirmed: { type: 'boolean', description: 'Optional scope confirmation; false refuses.' },
    }, ['incomeYear', 'lines']),
    run(input) {
      const lines = input.lines.map((/** @type {Record<string, any>} */ l) => ({
        label: l.label, leave: l.leave, hours: l.hours, hourly_rate: l.hourlyRate, probability: l.probability,
        settled_within_12_months: l.settledWithin12Months,
        ...(l.yearsToSettlement === undefined ? {} : { years_to_settlement: l.yearsToSettlement }),
        ...(l.salaryGrowth === undefined ? {} : { salary_growth: l.salaryGrowth }),
        ...(l.discountRate === undefined ? {} : { discount_rate: l.discountRate }),
        ...(l.canDeferSettlement === undefined ? {} : { can_defer_settlement: l.canDeferSettlement }),
      }));
      const r = leaveProvisions({ lines, defined_benefit_plan: false, plan_assets: false, year: input.incomeYear,
        scope_confirmed: input.scopeConfirmed ?? true });
      return { incomeYear: r.year, annualLeaveProvision: r.amounts.annual_leave_provision,
        longServiceLeaveProvision: r.amounts.long_service_leave_provision, totalProvision: r.amounts.total_provision,
        currentProvision: r.amounts.current_provision, nonCurrentProvision: r.amounts.non_current_provision,
        lines: r.lines.map((l) => ({ label: l.label, leave: l.leave, category: l.category, valueAtCurrentRate: l.value_at_current_rate,
          projectedValue: l.projected_value ?? null, provision: l.provision, classification: l.classification })),
        warnings: r.warnings, currency: 'AUD', source: `${CALCULATORS}leave-provisions/` };
    },
  });
}

/**
 * The business calculators added 26 November 2026, keyed by each form's `data-calculator` slug.
 * @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'instantAssetWriteOff' | 'IAWO_YEARS' | 'leaveProvisions' | 'LEAVE_YEARS'>} calculate
 */
export function businessS1Tools(kit, calculate) {
  return {
    'instant-asset-write-off': instantAssetWriteOffTool(kit, calculate.instantAssetWriteOff, calculate.IAWO_YEARS),
    'leave-provisions': leaveProvisionsTool(kit, calculate.leaveProvisions, calculate.LEAVE_YEARS),
  };
}
