// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for the 'do I need to lodge' test. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {{LODGMENT_YEARS: string[], STATED: string[],
 *   lodgmentRequired: typeof import('./lodgment-required.mjs').lodgmentRequired}} LodgmentEngine */

/** @param {ToolKit} kit @param {LodgmentEngine} engine */
export function lodgmentRequiredTool(kit, { LODGMENT_YEARS, STATED, lodgmentRequired }) {
  const { text, choice, whole, record, tool, INDIVIDUAL } = kit;
  const amount = (/** @type {string} */ what) => text('trillionCost', `${what} in AUD, at most 2 decimal places.`);
  return tool({
    name: 'check_lodgment_required',
    title: 'Do I need to lodge a tax return',
    description: `Whether one individual must lodge their own income tax return for ${LODGMENT_YEARS[0]} to ${LODGMENT_YEARS.at(-1)} `
      + 'under that year\'s lodgment instrument made under ITAA 1936 s 161 (the Notices to 2022-23, the Taxation Laws instruments from '
      + '2023-24): the conditions of ss 6(2), 6(3) and 6(10) (the $18,200 threshold, $13,464 plus $395 a month part-year, $416 under 18, '
      + '$18,200 of dividends, the study loan income), then the working holiday maker, listed payment and seniors and pensioners '
      + 'exceptions of s 7, and the 31 October due date. Amounts are AUD decimal strings. Residency and the conditions needing a judgement are stated answers. Excludes '
      + 'trustees, partners, agents, companies and other full self-assessment taxpayers, substituted accounting periods, 2026-27 '
      + '(no instrument made) and the separate instrument for parents liable for or entitled to child support.',
    inputSchema: record({
      incomeYear: choice(LODGMENT_YEARS, `Income year, ${LODGMENT_YEARS[0]} to ${LODGMENT_YEARS.at(-1)}.`),
      residency: choice(['whole_year', 'part_year', 'none'], 'Australian resident for the whole year, part of it or none of it.'),
      monthsResident: whole(1, 12, 'With part_year: months resident, counting the months residency began and ended.'),
      taxableAustralianIncome: { type: 'boolean', description: 'With none: income, including capital gains, taxable in Australia other than the excluded withholding payments.' },
      taxableIncome: amount('Taxable income for the year'),
      dividendsAndFrankingCredits: amount('Assessable dividends or distributions and franking credits'),
      conditions: { type: 'array', maxItems: STATED.length, items: choice(STATED, 'A condition of s 6(2) that applied in the year.'),
        description: `Stated conditions of s 6(2) that applied: ${STATED.join(', ')}.` },
      under18IncomeExcludingWork: amount('Only for a person under 18 at all times in the year: income other than for work personally performed'),
      studyLoanIncome: amount('Only with a study or training loan debt on 1 June before the year: income including foreign-sourced income'),
      workingHolidayMaker: record({
        otherAssessableIncome: { type: 'boolean', description: 'Any assessable income other than as a working holiday maker.' },
        taxableIncomeExcludingRemainders: amount('Taxable income without super or ETP remainders'),
      }, ['otherAssessableIncome', 'taxableIncomeExcludingRemainders']),
      listedPaymentOtherAssessableIncome: { type: 'boolean', description: 'Only when assessable income included a payment the instrument lists: any other assessable income.' },
      sapto: record({
        rebateIncome: amount('Rebate income'),
        category: choice(['single', 'apart', 'together'], 'single (single, widowed or separated), apart (living apart due to illness or a nursing home) or together.'),
      }, ['rebateIncome', 'category']),
      childSupportParent: { type: 'boolean', description: 'A parent liable for or entitled to child support; refused where this instrument requires no return.' },
      scopeConfirmed: { type: 'boolean', description: 'Optional scope confirmation; false refuses.' },
    }, ['incomeYear', 'residency', 'taxableIncome', 'dividendsAndFrankingCredits']),
    run({ incomeYear, residency, monthsResident, taxableAustralianIncome, taxableIncome, dividendsAndFrankingCredits, conditions = [],
      under18IncomeExcludingWork, studyLoanIncome, workingHolidayMaker, listedPaymentOtherAssessableIncome, sapto,
      childSupportParent = false, scopeConfirmed = true }) {
      const r = lodgmentRequired({
        residency: residency === 'part_year' ? { status: residency, months: monthsResident }
          : residency === 'none' ? { status: residency, taxable_australian_income: taxableAustralianIncome } : { status: residency },
        taxable_income: taxableIncome,
        dividends_and_franking_credits: dividendsAndFrankingCredits,
        under_18: under18IncomeExcludingWork === undefined ? null : { income_excluding_work: under18IncomeExcludingWork },
        triggers: conditions,
        study_loan: studyLoanIncome === undefined ? null : { income: studyLoanIncome },
        working_holiday_maker: workingHolidayMaker === undefined ? null : { other_assessable_income: workingHolidayMaker.otherAssessableIncome,
          taxable_income_excluding_remainders: workingHolidayMaker.taxableIncomeExcludingRemainders },
        listed_payment: listedPaymentOtherAssessableIncome === undefined ? null : { other_assessable_income: listedPaymentOtherAssessableIncome },
        sapto: sapto === undefined ? null : { rebate_income: sapto.rebateIncome, category: sapto.category },
        child_support_parent: childSupportParent,
        year: incomeYear,
        scope_confirmed: scopeConfirmed,
      });
      return {
        incomeYear: r.year, lodgmentRequired: r.lodgment_required, requiredBy: r.required_by, exceptionsApplied: r.exceptions_applied,
        dueDate: r.due_date, instrument: r.instrument, steps: r.steps, currency: 'AUD', source: `${INDIVIDUAL}lodgment-required/`,
      };
    },
  });
}
