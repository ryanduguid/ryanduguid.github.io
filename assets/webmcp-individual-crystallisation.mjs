// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for super crystallisation at 30 June 2007. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {{superCrystallisation: typeof import('./super-crystallisation.mjs').superCrystallisation}} CrystallisationEngine */

/** @param {ToolKit} kit @param {CrystallisationEngine} engine */
export function crystallisationTool(kit, { superCrystallisation }) {
  const { text, record, tool, INDIVIDUAL } = kit;
  const amount = (/** @type {string} */ what) => text('trillionCost', `${what} at 30 June 2007, AUD.`);
  return tool({
    name: 'calculate_super_crystallisation',
    title: 'Super crystallisation at 30 June 2007',
    description: 'Works the crystallised segment of a super interest’s tax free component at 30 June 2007 (ITAA 1997 s 307-225), '
      + 'in AUD: the concessional, post-June 1994 invalidity and CGT exempt components, the undeducted contributions and the pre-July 83 '
      + 'component (former ITAA 1936 s 27AA(1)(d): the lesser of the base x days before 1 July 1983 / service days and the base less '
      + 'undeducted contributions), and the taxable component left. Non-qualifying and excessive components are nil; an untaxed '
      + 'source and an income stream first paid before 1 July 2007 are refused.',
    inputSchema: record({
      eligibleServiceStart: text('date', 'First day of the eligible service period, YYYY-MM-DD, on or before 2007-06-30.'),
      interestValue: amount('Value of the interest'),
      concessionalComponent: amount('Concessional component'),
      postJune1994InvalidityComponent: amount('Post-June 1994 invalidity component'),
      cgtExemptComponent: amount('CGT exempt component'),
      undeductedContributions: amount('Undeducted contributions'),
      untaxedSource: { type: 'boolean', description: 'The interest is from an untaxed source (refused).' },
      incomeStreamBeforeJuly2007: { type: 'boolean', description: 'The interest supports an income stream first paid before 1 July 2007 (refused).' },
    }, ['eligibleServiceStart', 'interestValue', 'concessionalComponent', 'postJune1994InvalidityComponent', 'cgtExemptComponent',
      'undeductedContributions']),
    run({ eligibleServiceStart, interestValue, concessionalComponent, postJune1994InvalidityComponent, cgtExemptComponent,
      undeductedContributions, untaxedSource = false, incomeStreamBeforeJuly2007 = false }) {
      const r = superCrystallisation({ year: '2006-07', scope_confirmed: true, eligible_service_start: eligibleServiceStart,
        interest_value: interestValue, concessional_component: concessionalComponent,
        post_june_1994_invalidity_component: postJune1994InvalidityComponent, cgt_exempt_component: cgtExemptComponent,
        undeducted_contributions: undeductedContributions, untaxed_source: untaxedSource, income_stream_before_july_2007: incomeStreamBeforeJuly2007 });
      const a = r.amounts;
      return { preJuly83Component: a.pre_july_83_component, crystallisedSegment: a.crystallised_segment, taxableComponent: a.taxable_component,
        serviceDays: Number(r.rates.service_days), preJuly1983Days: Number(r.rates.pre_july_1983_days), source: `${INDIVIDUAL}super-crystallisation/` };
    },
  });
}
