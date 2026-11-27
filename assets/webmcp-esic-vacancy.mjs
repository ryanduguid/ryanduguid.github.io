// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for the ESIC tax offset and residential vacancy fee calculators. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

/** @param {ToolKit} kit @param {Pick<BusinessCalculators, 'esic' | 'ESIC_YEARS'>} calculate */
export function esicTool(kit, calculate) {
  const { text, choice, record, tool, CALCULATORS } = kit;
  const years = calculate.ESIC_YEARS;
  const flag = (/** @type {string} */ description) => ({ type: /** @type {const} */ ('boolean'), description });
  const amount = (/** @type {string} */ description) => text('trillionCost', `${description} in AUD.`);
  const yearOrNone = (/** @type {string} */ description) => ({ type: /** @type {const} */ ('string'), description: `${description}, as an income year such as 2024-25, or none.` });
  return tool({
    name: 'calculate_esic_tax_offset',
    title: 'Early stage innovation company tax offset calculator',
    description: `The early stage investor tax offset in AUD under ITAA 1997 Subdivision 360-A for one investor's new shares in one company in ${years.at(-1)} to ${years[0]}: `
      + 'the early stage innovation company tests of s 360-40 and the 100-point test of s 360-45 from the items stated, the investor tests of ss 360-15 and 360-20, '
      + '20% of the amount for the issue (s 360-25(1)) capped at $200,000 with affiliates and carried forward offsets (s 360-25(2)), and whether the modified CGT '
      + 'treatment follows. It does not decide the principles-based test or the innovation items, nor work out trust or partnership members\' offsets.',
    inputSchema: record({
      incomeYear: choice([...years], `Income year the shares were issued, ${years.at(-1)} to ${years[0]}.`),
      investor: choice(['individual', 'company', 'widely_held_company', 'esvclp', 'trust', 'partnership'], 'The investor; a trust or partnership is refused.'),
      amountPaid: amount('Money paid for the shares'), amountReceivable: amount('Money the company is still to receive for the shares; omit for none'),
      nonCashBenefit: amount('Market value of a non-cash benefit for the shares; 0 when omitted'),
      disclosureExemption: flag('true when Corporations Act s 708(8), (10) or (11) removed the need for a disclosure document for the offer.'),
      otherCompaniesPaid: amount('Paid in the year for other ESICs\' shares; only when disclosureExemption is false'),
      otherCompaniesExempt: flag('true when an offer by another ESIC needed no disclosure document; only when disclosureExemption is false.'),
      incorporatedYear: yearOrNone('Income year the company was incorporated in Australia'),
      abrRegisteredYear: yearOrNone('Income year the company was registered in the Australian Business Register; none when omitted'),
      expensesThreePriorYears: amount('Total expenses over the 3 income years before; 0 when omitted'),
      totalExpensesPreviousYear: amount('Total expenses in the previous income year'),
      assessableIncomePreviousYear: amount('Assessable income in the previous income year'),
      acceleratingCommercialisationGrant: amount('Part of that income from an Accelerating Commercialisation Grant; 0 when omitted'),
      rdClawbackIncome: amount('Part of that income from a s 355-450(1) amount; 0 when omitted'),
      innovationItems: { type: 'array', maxItems: 8, items: kit.whole(1, 8, 'A s 360-45(1) table item, 1 to 8.'), description: 'The s 360-45(1) items that apply; none when omitted.' },
      principlesTest: flag('true when the company meets the principles-based test of s 360-40(1)(e)(i) to (v); false when omitted.'),
      listed: flag('true when the company\'s equity interests are listed; false when omitted.'),
      foreignCompany: flag('true when the company is a foreign company; false when omitted.'),
      affiliateOfCompany: flag('true when the investor and company are affiliates; false when omitted.'),
      essInterests: flag('true when the shares are ESS interests; false when omitted.'),
      moreThan30Percent: flag('true when the investor holds more than 30%; false when omitted.'),
      otherOffsets: amount('Offsets of the investor and affiliates for the year for other shares; 0 when omitted'),
      carriedForwardOffsets: amount('Offsets carried forward to the year; 0 when omitted'),
    }, ['incomeYear', 'investor', 'amountPaid', 'disclosureExemption', 'incorporatedYear', 'totalExpensesPreviousYear', 'assessableIncomePreviousYear']),
    run(input) {
      /** @type {Record<string, unknown>} */
      const call = { investor: input.investor, affiliate_of_company: input.affiliateOfCompany ?? false, ess_interests: input.essInterests ?? false,
        more_than_30_percent: input.moreThan30Percent ?? false, amount_paid: input.amountPaid, non_cash_benefit: input.nonCashBenefit ?? '0',
        disclosure_exemption: input.disclosureExemption, incorporated_year: input.incorporatedYear, abr_registered_year: input.abrRegisteredYear ?? 'none',
        expenses_three_prior_years: input.expensesThreePriorYears ?? '0', total_expenses_previous_year: input.totalExpensesPreviousYear,
        assessable_income_previous_year: input.assessableIncomePreviousYear, accelerating_commercialisation_grant: input.acceleratingCommercialisationGrant ?? '0',
        rd_clawback_income: input.rdClawbackIncome ?? '0', listed: input.listed ?? false, foreign_company: input.foreignCompany ?? false,
        innovation_items: input.innovationItems ?? [], principles_test: input.principlesTest ?? false, other_offsets: input.otherOffsets ?? '0',
        carried_forward_offsets: input.carriedForwardOffsets ?? '0', year: input.incomeYear, scope_confirmed: true };
      for (const [from, to] of [['amountReceivable', 'amount_receivable'], ['otherCompaniesPaid', 'other_companies_paid'], ['otherCompaniesExempt', 'other_companies_exempt']]) {
        if (input[from] !== undefined) call[to] = input[from]; // eslint-disable-line security/detect-object-injection -- from and to are this tool's own input and the command's names
      }
      const r = calculate.esic(call);
      return { incomeYear: r.period, esic: r.esic, innovationPoints: r.innovation_points, entitled: r.entitled,
        modifiedCgtTreatment: r.modified_cgt_treatment, taxOffset: r.amounts.tax_offset, offsetBase: r.amounts.offset_base,
        grossOffset: r.amounts.gross_offset, capRoom: r.amounts.cap_room, tests: r.tests, steps: r.steps, currency: 'AUD', source: `${CALCULATORS}esic/` };
    },
  });
}

/** @param {ToolKit} kit @param {Pick<BusinessCalculators, 'residentialVacancyFee' | 'RVF_YEARS'>} calculate */
export function vacancyFeeTool(kit, calculate) {
  const { text, choice, record, tool, CALCULATORS } = kit;
  const years = calculate.RVF_YEARS;
  const day = (/** @type {string} */ description) => ({ type: /** @type {const} */ ('string'), description: `${description}, as YYYY-MM-DD.` });
  return tool({
    name: 'calculate_residential_vacancy_fee',
    title: 'Residential vacancy fee calculator',
    description: `The annual vacancy fee in AUD for a foreign owner of a residential dwelling under FATA 1975 Part 6A, for a vacancy year starting in ${years.at(-1)} to ${years[0]}: `
      + 'liable when the dwelling was residentially occupied or genuinely available to rent for fewer than 183 days or the return was late, nil when held only part of the year '
      + 'or a FATR 2015 s 43D exemption applies; the fee is the application fee stated or worked from the Fees Imposition Regulations 2020 schedule, doubled for vacancy years '
      + 'from 9 April 2024. Also the return due date and record keeping. It does not decide foreign person status, occupation or exemptions, and refuses build to rent and partial waivers.',
    inputSchema: record({
      incomeYear: choice([...years], `Financial year the vacancy year starts in, ${years.at(-1)} to ${years[0]}.`),
      vacancyYearStart: day('First day of the 12-month vacancy year'),
      heldFullVacancyYear: { type: 'boolean', description: 'true when held as a foreign person for the whole vacancy year.' },
      residentiallyOccupiedDays: kit.whole(0, 366, 'Days residentially occupied or genuinely available to rent for at least 30 days.'),
      returnLodgedOnTime: { type: 'boolean', description: 'true when the vacancy fee return was lodged within 30 days after the year.' },
      exemption: choice(['damaged_unsafe_or_unsuitable', 'substantial_repairs_or_renovations', 'legal_restriction_or_court_order', 'medical_or_residential_care'], 'A FATR 2015 s 43D exemption with evidence; none when omitted.'),
      acquisitionBasis: choice(['notifiable_action', 'developer_exemption_certificate', 'other_exemption_certificate', 'no_notice_order'], 'How the dwelling was acquired.'),
      ownership: choice(['sole', 'joint_tenants', 'tenants_in_common'], 'How the dwelling is owned.'),
      applicationFeeWaiver: choice(['none', 'full'], 'Whether the application fee was waived in full; none when omitted.'),
      applicationFeePayable: text('trillionCost', 'The application fee paid by this owner in AUD; or give consideration with dwellingKind and applicationDate.'),
      consideration: text('trillionCost', 'Consideration for the dwelling in AUD.'),
      dwellingKind: choice(['new_or_near_new', 'established'], 'The dwelling.'),
      applicationDate: day('Date the application or notice was given'),
      ownershipShare: { type: 'string', description: 'A tenant in common\'s share as a decimal strictly between 0 and 1.' },
    }, ['incomeYear', 'vacancyYearStart', 'heldFullVacancyYear', 'residentiallyOccupiedDays', 'returnLodgedOnTime', 'acquisitionBasis', 'ownership']),
    run(input) {
      /** @type {Record<string, unknown>} */
      const call = { vacancy_year_start: input.vacancyYearStart, held_full_vacancy_year: input.heldFullVacancyYear,
        residentially_occupied_days: input.residentiallyOccupiedDays, return_lodged_on_time: input.returnLodgedOnTime, exemption: input.exemption ?? null,
        acquisition_basis: input.acquisitionBasis, ownership: input.ownership, application_fee_waiver: input.applicationFeeWaiver ?? 'none',
        vacancy_fee_waiver_or_remission: false, year: input.incomeYear, scope_confirmed: true };
      for (const [from, to] of [['applicationFeePayable', 'application_fee_payable'], ['consideration', 'consideration'], ['dwellingKind', 'dwelling_kind'],
        ['applicationDate', 'application_date'], ['ownershipShare', 'ownership_share']]) {
        if (input[from] !== undefined) call[to] = input[from]; // eslint-disable-line security/detect-object-injection -- from and to are this tool's own input and the command's names
      }
      const r = calculate.residentialVacancyFee(call);
      return { incomeYear: r.period, liable: r.liable, liabilityStatus: r.liability_status, vacancyFeePayable: r.amounts.vacancy_fee_payable,
        applicationFeeBase: r.amounts.application_fee_base, vacancyYearEnd: r.vacancy_year_end, returnDueDate: r.return_due_date,
        recordRetentionUntil: r.record_retention_until, feeBasis: r.fee_basis, rates: r.rates, steps: r.steps, currency: 'AUD',
        source: `${CALCULATORS}residential-vacancy-fee/` };
    },
  });
}
