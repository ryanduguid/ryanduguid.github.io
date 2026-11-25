// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for the 183-day residency day count. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {{RESIDENCY_YEARS: string[], MAX_PERIODS: number,
 *   residencyDays: typeof import('./residency-days.mjs').residencyDays}} ResidencyEngine */

const NOT_DECIDED = 'Only the 183-day test (ITAA 1936 s 6(1) resident (a)(ii)). Residency is not decided: the ordinary concepts, '
  + 'domicile and Commonwealth superannuation fund tests are not applied (see TR 2023/1).';

/** @param {ToolKit} kit @param {ResidencyEngine} engine */
export function residencyDaysTool(kit, { RESIDENCY_YEARS, MAX_PERIODS, residencyDays }) {
  const { text, choice, record, tool, INDIVIDUAL } = kit;
  const period = record({
    arrival: text('date', 'Day of arrival in Australia, YYYY-MM-DD (1900 to 2100); counts as a whole day.'),
    departure: text('date', 'Day of departure from Australia, YYYY-MM-DD, not before arrival; counts as a whole day.'),
  }, ['arrival', 'departure']);
  return tool({
    name: 'calculate_residency_days',
    title: '183-day residency day count',
    description: 'Counts the distinct days present in Australia in an income year (1 July to 30 June, '
      + `${RESIDENCY_YEARS[0]} to ${RESIDENCY_YEARS.at(-1)}) from arrival and departure dates, part days counted whole `
      + '(TR 2023/1 paragraphs 86 and 87), and reports the 183-day test in ITAA 1936 s 6(1) resident (a)(ii): more than '
      + 'one-half of the year (183 days, 184 in a leap year), unless the usual place of abode is outside Australia and there '
      + 'is no intention to take up residence, both as stated. Does not decide residency: the ordinary concepts, domicile '
      + 'and Commonwealth superannuation tests, treaties and part-year residency are excluded.',
    inputSchema: record({
      incomeYear: choice(RESIDENCY_YEARS, `Income year, ${RESIDENCY_YEARS[0]} to ${RESIDENCY_YEARS.at(-1)}.`),
      periods: { type: 'array', maxItems: MAX_PERIODS, items: period,
        description: `Up to ${MAX_PERIODS} periods in Australia; days outside the income year and overlaps are not counted twice.` },
      usualPlaceOfAbodeOutsideAustralia: { type: 'boolean', description: 'Stated: the usual place of abode is outside Australia.' },
      intendsToTakeUpResidence: { type: 'boolean', description: 'Stated: intends to take up residence in Australia.' },
      scopeConfirmed: { type: 'boolean', description: 'Optional scope confirmation; false refuses.' },
    }, ['incomeYear', 'periods', 'usualPlaceOfAbodeOutsideAustralia', 'intendsToTakeUpResidence']),
    run({ incomeYear, periods, usualPlaceOfAbodeOutsideAustralia, intendsToTakeUpResidence, scopeConfirmed = true }) {
      const presence = periods.map((/** @type {{arrival: string, departure: string}} */ p) => ({ from: p.arrival, to: p.departure }));
      const r = residencyDays(incomeYear, presence, usualPlaceOfAbodeOutsideAustralia, intendsToTakeUpResidence, scopeConfirmed);
      return {
        incomeYear: r.year, firstDay: r.income_year.first_day, lastDay: r.income_year.last_day, daysInYear: r.income_year.days,
        daysInAustralia: r.tests.days_in_australia, daysNeeded: r.tests.days_needed,
        moreThanHalfReached: r.tests.days_in_australia >= r.tests.days_needed, exceptionApplies: r.visitor,
        test183Met: r.tests.days_183, residencyDecided: false, note: NOT_DECIDED, source: `${INDIVIDUAL}residency-days/`,
      };
    },
  });
}
