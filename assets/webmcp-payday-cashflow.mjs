// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for the Payday Super cashflow calculator (added 26 November 2026).
// Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

/** @param {ToolKit} kit @param {BusinessCalculators['paydayCashflow']} paydayCashflow */
export function paydayCashflowTool(kit, paydayCashflow) {
  const { text, choice, record, tool, CALCULATORS } = kit;
  return tool({
    name: 'calculate_payday_super_cashflow',
    title: 'Payday Super cashflow calculator',
    description: 'Super guarantee cash timing in AUD for one employee and one quarter of 2026-27: each payday\'s 12% of ordinary time earnings '
      + '(qualifying earnings, SGAA s 17A) and the date the fund must receive it under Payday Super, 7 business days after '
      + 'payday on the site\'s Payday Super calendar (the earliest possible date where 24 or 31 December decides it), against '
      + 'the old quarterly due date 28 days after the quarter (old s 23(6)), with the days earlier, the running extra working '
      + 'capital and its peak. It assumes the same earnings each payday and does not apply the longer due periods, the '
      + 'maximum contributions base or the Norfolk Island rate.',
    inputSchema: record({
      quarter: choice(['1', '2', '3', '4'], 'Quarter of 2026-27: "1" July to September 2026, "2" October to December 2026, '
        + '"3" January to March 2027, "4" April to June 2027.'),
      payCycle: choice(['weekly', 'fortnightly', 'monthly'], 'How often employees are paid.'),
      firstPayday: text('date', 'First payday in the quarter as YYYY-MM-DD: within its first 7 days (weekly), 14 days '
        + '(fortnightly) or month (monthly; later paydays fall on the same date or the month\'s last day).'),
      earningsPerPayday: text('amount', 'One employee\'s ordinary time earnings, plus salary sacrificed and other qualifying '
        + 'earnings, paid each payday, in AUD with at most 2 decimal places. Super guarantee is rounded for each employee, '
        + 'so run the tool once for each employee.'),
    }, ['quarter', 'payCycle', 'firstPayday', 'earningsPerPayday']),
    run(input) {
      const r = paydayCashflow({ quarter: input.quarter, cycle: input.payCycle, firstPayday: input.firstPayday,
        earnings: input.earningsPerPayday });
      const money = (/** @type {number} */ value) => value.toFixed(2);
      return {
        paydays: r.paydays.map((p) => ({ payday: p.payday, superGuarantee: money(p.sg), fundMustReceiveBy: p.due,
          dueDateDependsOnPartDayHolidays: p.partDay, daysBeforeQuarterlyDueDate: p.daysEarlier,
          extraWorkingCapital: money(p.ahead) })),
        quarterlyDueDate: r.quarterlyDue, superGuaranteeForQuarter: money(r.total),
        peakExtraWorkingCapital: money(r.peak), peakFrom: r.peakFrom, peakDays: r.peakDays,
        averageDaysEarlier: r.averageDaysEarlier.toFixed(1), currency: 'AUD', source: `${CALCULATORS}payday-cashflow/`,
      };
    },
  });
}
