// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for the casual and overtime pay calculator. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

/** @param {ToolKit} kit @param {BusinessCalculators['casualOvertime']} casualOvertime */
export function casualOvertimeTool(kit, casualOvertime) {
  const { tool, text, record, dollars, CALCULATORS } = kit;
  const hours = text('amount', 'Hours, up to 1,000 with at most 2 decimal places.');
  return tool({
    name: 'calculate_casual_overtime_pay',
    title: 'Casual and overtime pay calculator',
    description: 'One employee\'s gross pay in AUD for one pay period from rates the caller states: no award, agreement or '
      + 'minimum rate is applied (the Fair Work Ombudsman\'s pay guides and Pay and Conditions Tool give award rates). '
      + 'Ordinary hours at the base hourly rate plus any casual loading, penalty or overtime lines at a percentage of the '
      + 'base rate, and annual leave with any leave loading; then the 12% super guarantee on ordinary time earnings '
      + '(SGAA s 6(1); qualifying earnings from 1 July 2026), counting casual loading and penalty rates on ordinary hours '
      + 'and leaving out overtime and leave loading for lost overtime (SGR 2009/2, draft LCR 2026/D1). Paydays from '
      + '1 July 2025 to 30 June 2027; refuses a pay whose ordinary time earnings exceed the maximum contribution base.',
    inputSchema: record({
      payday: text('date', 'Payday, YYYY-MM-DD, from 2025-07-01 to 2027-06-30.'),
      baseRate: text('amount', 'Base hourly rate in AUD, 0.01 to 10,000.'),
      casualLoadingPercent: text('percent', 'Casual loading on ordinary hours as a percentage of the base rate (0 to 100); "0" when omitted.'),
      ordinaryHours: { ...hours, description: 'Ordinary hours at the base rate, up to 1,000.' },
      lines: {
        type: 'array', maxItems: 8, description: 'Up to 8 penalty or overtime lines; [] when omitted.',
        items: record({
          hours: { ...hours, description: 'Hours on this line, more than 0 and up to 1,000.' },
          percentOfBaseRate: text('amount', 'This line\'s rate as a percentage of the base rate, more than 0 and up to 1,000, as the award or agreement states it.'),
          overtime: { type: 'boolean', description: 'true for overtime hours (not ordinary time earnings); false for ordinary hours at a penalty or shift rate.' },
        }, ['hours', 'percentOfBaseRate', 'overtime']),
      },
      annualLeaveHours: text('amount', 'Hours of paid annual leave at the base rate (not with a casual loading); "0" when omitted.'),
      leaveLoadingPercent: text('percent', 'Annual leave loading percentage (0 to 100); "0" when omitted.'),
      leaveLoadingForLostOvertime: { type: 'boolean', description: 'true when the leave loading is paid for overtime lost on leave; false when omitted.' },
    }, ['payday', 'baseRate', 'ordinaryHours']),
    run(input) {
      const r = casualOvertime({
        payday: input.payday, base_rate: input.baseRate, casual_loading: input.casualLoadingPercent ?? '0',
        ordinary_hours: input.ordinaryHours,
        lines: (input.lines ?? []).map((/** @type {Record<string, any>} */ l) => ({ hours: l.hours, percent: l.percentOfBaseRate, overtime: l.overtime })),
        leave_hours: input.annualLeaveHours ?? '0', leave_loading: input.leaveLoadingPercent ?? '0',
        leave_loading_overtime: input.leaveLoadingForLostOvertime ?? false,
      });
      return {
        payday: r.payday, rules: r.rules, ordinaryPay: dollars(r.ordinaryPay), casualLoading: dollars(r.casualLoading),
        lines: r.lines.map((l) => ({ hours: l.hours, percentOfBaseRate: l.percent, overtime: l.overtime, pay: dollars(l.pay) })),
        penaltyPay: dollars(r.penaltyPay), overtimePay: dollars(r.overtimePay), leavePay: dollars(r.leavePay),
        leaveLoading: dollars(r.leaveLoading), grossPay: dollars(r.grossPay), ordinaryTimeEarnings: dollars(r.ote),
        notOrdinaryTimeEarnings: dollars(r.notOte), superGuaranteePercent: r.sgRate, superGuarantee: dollars(r.superGuarantee),
        awardApplied: false, currency: 'AUD', source: `${CALCULATORS}casual-overtime/`,
      };
    },
  });
}
