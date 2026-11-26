// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for the FBT return page: the return (with the not-for-profit rebate and caps
// and items 20 to 22) and one quarter's FBT instalment. Imported by assets/webmcp-business-e.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

/** @param {ToolKit} kit @param {BusinessCalculators['fbtReturn']} fbtReturn @param {BusinessCalculators['ITEM_23']} items @param {BusinessCalculators['FBT_EMPLOYER_KINDS']} kinds */
export function fbtReturnTool(kit, fbtReturn, items, kinds) {
  const { tool, text, choice, record, CALCULATORS } = kit;
  const benefit = record({
    employee: { type: 'string', description: 'Label for the employee the benefit is provided in respect of; each label is one person.' },
    label: choice(items.map(([label]) => label), 'FBT return item 23 category of the benefit (23A statutory car to 23P meal entertainment).'),
    gstType: choice(['type_1', 'type_2'], 'type_1 when the provider could claim GST credits for it (FBTAA s 5C(3)), otherwise type_2.'),
    excluded: { type: 'boolean', description: 'true for an excluded fringe benefit (s 5E(3)); car parking (23N) and meal entertainment (23P) must be true.' },
    grossTaxableValue: text('cost', 'Gross taxable value before employee contributions and reductions, in AUD.'),
    employeeContribution: text('cost', 'Employee contribution applied, in AUD; "0" when omitted.'),
    taxableValue: text('cost', 'Taxable value as worked out for the benefit, in AUD (nil for an exempt electric car).'),
    entertainment: choice(['salary_packaged', 'not_salary_packaged'], 'Not-for-profit employers only: meal entertainment or entertainment facility leasing, salary packaged or not.'),
    electricCarExempt: { type: 'boolean', description: 'true for a car exempt under s 8A; give its notional value as reportableTaxableValue.' },
    reportableTaxableValue: text('cost', 'Exempt electric car only: its notional taxable value, counted for reporting (s 135P(3)), in AUD.'),
  }, ['employee', 'label', 'gstType', 'excluded', 'grossTaxableValue', 'taxableValue']);
  return tool({
    name: 'calculate_fbt_return',
    title: 'FBT return calculator',
    description: 'One employer\'s FBT return in AUD for the FBT year ended 31 March 2026 or 2027 from each benefit\'s established '
      + 'taxable value: type 1 and type 2 gross-up (FBTAA s 5B), items 14A to 19, item 23 by category, each employee\'s '
      + 'reportable fringe benefits amount (s 135P), a rebatable employer\'s rebate (s 65J), the $30,000 or $17,000 caps of '
      + 's 57A employers with the $5,000 salary packaged entertainment cap, and items 20 to 22 from instalments reported. '
      + 'Does not value benefits, decide their type or exclusion, or work out payroll tax.',
    inputSchema: record({
      yearEnded: choice(['2026', '2027'], 'FBT year ended 31 March.'),
      employerKind: choice(kinds.map(([kind]) => kind), 'Employer kind; "taxable" when omitted.'),
      rebatableDays: { type: 'integer', minimum: 0, maximum: 366, description: 'Rebatable employer only: whole days it was a rebatable employer.' },
      employerDays: { type: 'integer', minimum: 1, maximum: 366, description: 'Rebatable employer only: days in the year it was an employer.' },
      instalmentsReported: text('cost', 'FBT instalments reported for the year less credits claimed at 6B, in AUD; omit to leave items 20 to 22.'),
      benefits: { type: 'array', maxItems: 200, items: benefit, description: 'From 1 to 200 fringe benefits, one employee each.' },
    }, ['yearEnded', 'benefits']),
    run(input) {
      /** @type {Record<string, unknown>} */
      const call = { year_ended: Number(input.yearEnded) };
      if (input.employerKind !== undefined) call.employer_kind = input.employerKind;
      if (input.rebatableDays !== undefined) call.rebatable_days = input.rebatableDays;
      if (input.employerDays !== undefined) call.employer_days = input.employerDays;
      if (input.instalmentsReported !== undefined) call.instalments_reported = input.instalmentsReported;
      call.benefits = input.benefits.map((/** @type {Record<string, any>} */ b) => {
        /** @type {Record<string, unknown>} */
        const out = { employee: b.employee, label: b.label, gst_type: b.gstType, excluded: b.excluded, gross_taxable_value: b.grossTaxableValue,
          employee_contribution: b.employeeContribution ?? '0', taxable_value: b.taxableValue };
        if (b.entertainment !== undefined) out.entertainment = b.entertainment;
        if (b.electricCarExempt !== undefined) out.electric_car_exempt = b.electricCarExempt;
        if (b.reportableTaxableValue !== undefined) out.reportable_taxable_value = b.reportableTaxableValue;
        return out;
      });
      const r = fbtReturn(call);
      return { yearEnded: r.year, employerKind: r.kind, returnLabels: r.labels, amounts: r.amounts, item23: r.item23,
        employees: r.employees, capping: r.capping, warnings: r.warnings, currency: 'AUD', source: `${CALCULATORS}fbt-return/` };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['fbtInstalment']} fbtInstalment @param {BusinessCalculators['FBT_REASONS']} reasons */
export function fbtInstalmentTool(kit, fbtInstalment, reasons) {
  const { tool, text, choice, record, CALCULATORS } = kit;
  return tool({
    name: 'calculate_fbt_instalment',
    title: 'FBT instalment calculator',
    description: 'One quarter\'s FBT instalment in AUD on the activity statement for the FBT year ended 31 March 2026 or 2027: '
      + 'the ATO amount at F1 copied to 6A, or a variation on the estimated year\'s FBT (F2) times the relevant fraction '
      + '(FBTAA s 109) less earlier instalments net of credits (s 111(1)), F3 and 6A, with any credit at 6B (s 112A).',
    inputSchema: record({
      yearEnded: choice(['2026', '2027'], 'FBT year ended 31 March.'),
      quarter: { type: 'integer', minimum: 1, maximum: 4, description: '1 to 4: quarters ending 30 June, 30 September, 31 December and 31 March.' },
      atoInstalment: text('cost', 'Not varying: the ATO instalment amount at F1, in AUD.'),
      estimatedTax: text('cost', 'Varying: estimated FBT for the year at F2, in AUD.'),
      previousInstalments: text('cost', 'Varying quarters 2 to 4: instalments for the year that fell due earlier, in AUD.'),
      previousCredits: text('cost', 'Varying: credits claimed at 6B for those instalments, in AUD; "0" when omitted.'),
      reasonCode: { type: 'integer', enum: reasons.map(([code]) => code), description: 'Varying: the F4 reason code.' },
    }, ['yearEnded', 'quarter']),
    run(input) {
      /** @type {Record<string, unknown>} */
      const call = { year_ended: Number(input.yearEnded), quarter: input.quarter };
      for (const [from, to] of [['atoInstalment', 'ato_instalment'], ['estimatedTax', 'estimated_tax'], ['previousInstalments', 'previous_instalments'],
        ['previousCredits', 'previous_credits'], ['reasonCode', 'reason_code']]) {
        if (input[from] !== undefined) call[to] = input[from]; // eslint-disable-line security/detect-object-injection -- keys come from this function's own list
      }
      const r = fbtInstalment(call);
      return { yearEnded: r.year, quarter: r.quarter, varied: r.varied, activityStatementLabels: r.labels, currency: 'AUD',
        source: `${CALCULATORS}fbt-return/` };
    },
  });
}
