// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for the remaining 6 individual tax calculators:
// study loan repayment, concessional catch-up, lump sum in arrears, FHSS,
// work expenses and government super amounts. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */

const STUDY_LOAN_DESCRIPTION = 'Compulsory HELP, VET Student Loan, Student Start-up Loan or Australian Apprenticeship Support '
  + 'Loan repayment in AUD for one income year from 2020-21 to 2026-27 under Division 154 of the Higher Education Support Act '
  + '2003. Sums repayment income in whole AUD (taxable income without any assessable FHSS released amount, reportable fringe '
  + 'benefits total, total net investment loss, reportable super contributions and exempt foreign employment income). From '
  + '2025-26 the repayment is marginal (15% above the minimum up to the second threshold and 17% above it, or 10% of all '
  + 'repayment income if less); for 2020-21 to 2024-25 one percentage applies to all repayment income, rounding half a cent '
  + 'up. It does not compute the cap at the remaining loan debt, voluntary repayments, the overseas debtors repayment levy, '
  + 'Medicare levy exemption relief, PAYG withholding or debt indexation. Sources on ';

const CATCH_UP_DESCRIPTION = 'Carry-forward unused concessional super contributions cap in AUD for 2024-25, 2025-26 or '
  + '2026-27 under ITAA 1997 s 291-20(1) to (7). Works out each earlier year\'s unused cap from 2018-19, applies unused cap '
  + 'earliest year first where an earlier year exceeded its cap with a total super balance under $500,000, and returns the '
  + 'available cap, cap applied, remaining cap, any excess, any proposed contribution\'s effect and each year\'s remaining '
  + 'unused cap with the year after which it lapses. Requires a total super balance below $500,000 on 30 June before the year '
  + 'to carry forward unused cap. Refuses defined benefit interests (Subdivision 291-C), gaps or missing years from the '
  + 'previous 5 years. An optional downsizer input tests one downsizer contribution under s 292-102: age 55 or more, a '
  + 'contract from 1 July 2018, within 90 days of the change of ownership unless allowed longer, covered to the lesser of '
  + '$300,000 less amounts already covered and the capital proceeds less amounts already covered from them. Sources on ';

const ARREARS_DESCRIPTION = 'Lump sum payment in arrears tax offset in AUD for a 2024-25, 2025-26 or 2026-27 year of receipt '
  + 'under ITAA 1936 Part III Division 17 Subdivision AB (ss 159ZR to 159ZRD), for an Australian resident for the whole of the '
  + 'receipt year and each recent accrual year taxed at resident rates with the full tax-free threshold. Checks the 10% '
  + 'threshold (s 159ZRA(1)(b)), works tax on arrears in the receipt year (s 159ZRB), notional tax for the 2 most recent '
  + 'accrual years from 2012-13 (s 159ZRC, including the temporary budget repair levy for 2014-15 to 2016-17) and distant '
  + 'accrual years at the average recent rate (s 159ZRD). Refuses non-residents, recent accrual years before 2012-13, and years '
  + 'containing an employment termination payment, unused leave on termination, a super benefit, above-average special '
  + 'professional income or primary producer averaging. Sources on ';

const FHSS_DESCRIPTION = 'First home super saver (FHSS) release, PAYG withholding, 30% non-refundable tax offset, conditional '
  + '20% FHSS tax and minimum recontribution in AUD under Taxation Administration Act 1953 Schedule 1 ss 138-30 to 138-40, '
  + 'ITAA 1997 Division 313 and Taxation Administration Regulations 2017 regs 26 and 53A. Supports confirmed ATO determination '
  + 'amounts ("stated") or a voluntary contribution ledger estimate ("estimate", verified SIC rates through 31 December 2026; '
  + 'the ledger estimate gives $7,859 vs ATO GN 2024/1 example 6\'s $5,190, an unresolved difference). Requires scopeConfirmed '
  + 'true (eligible Australian resident, eligible accumulation funds, single release). Does not check scheme eligibility, '
  + 'contribution classification or contract deadlines. Sources on ';

const WORK_EXPENSES_DESCRIPTION = 'An employee\'s working from home, car (cents per kilometre or log book) or self-education '
  + 'deduction in AUD for one income year from 2020-21 to 2026-27, one method per call, with exact cents and the return amount '
  + 'with cents disregarded. Applies PCG 2023/1 (67c for 2022-23 and 2023-24, 70c from 2024-25), 52c fixed and 80c shortcut '
  + 'rates for 2020-21 and 2021-22, ITAA 1997 Division 28 car rates (72c to 91c, 5,000 km cap) and log book validity (5 years, '
  + 'at least 12 continuous weeks), and s 8-1 / TR 2024/3 self-education rules including the $250 s 82A reduction to 2021-22. '
  + 'Refuses reimbursed expenses, allowance-covered expenses, cars not owned or leased, expired or unrepresentative log books '
  + 'and fields belonging to another method or year. Does not check records, apportion costs, compute decline in value or cover '
  + 'occupancy expenses. Sources on ';

const GOVERNMENT_SUPER_DESCRIPTION = 'Super co-contribution, low income superannuation tax offset (LISTO) and optional spouse '
  + 'contribution tax offset in AUD for one person resident in Australia all year, 2020-21 to 2026-27, under the '
  + 'Superannuation (Government Co-contribution for Low Income Earners) Act 2003 (ss 6, 8, 9, 10, 10A, 11, 12C, 12E; payments '
  + 'rounded up to 5 cents under reg 15(2)) and ITAA 1997 ss 290-230 and 290-235. Refuses temporary visa holders, non-residents '
  + 'and part-year residents, unconfirmed scope, nil total income when the 10% eligible income test decides an amount, and '
  + 'unknown cap or balance answers when they decide an amount. Does not cover 2027-28, downsizer contributions, constitutionally '
  + 'protected funds or deceased estates. Sources on ';

const EARLIER_CATCH_UP_YEARS = ['2018-19', '2019-20', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26'];
const FHSS_DEDUCTION_YEARS = ['2017-18', '2018-19', '2019-20', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];
const FHSS_STATED_FIELDS = ['concessional', 'nonConcessional', 'associatedEarnings', 'actualRelease'];
const FHSS_ESTIMATE_FIELDS = ['determinationRequested', 'contributions', 'deductions'];

/** @param {string} value */
const triState = (value) => (value === 'unknown' ? null : value === 'yes');

/**
 * @param {ToolKit} kit
 * @param {typeof import('./study-loan.mjs').studyLoanRepayment} studyLoanRepayment
 * @param {string[]} studyLoanYears
 */
export function studyLoanTool(kit, studyLoanRepayment, studyLoanYears) {
  const { choice, whole, record, tool, dollars, dollarsOnly, INDIVIDUAL } = kit;
  return tool({
    name: 'calculate_study_loan_repayment',
    title: 'Study and training loan repayment calculator',
    description: `${STUDY_LOAN_DESCRIPTION}${INDIVIDUAL}study-loan/.`,
    inputSchema: record({
      incomeYear: choice(studyLoanYears, `Income year, ${studyLoanYears.at(-1)} to ${studyLoanYears[0]}.`),
      taxableIncome: whole(0, 1e9, 'Taxable income without any assessable FHSS released amount, in whole AUD.'),
      reportableFringeBenefits: dollarsOnly('Reportable fringe benefits total.'),
      totalNetInvestmentLoss: dollarsOnly('Total net investment loss, including net rental losses.'),
      reportableSuperContributions: dollarsOnly('Reportable super contributions.'),
      exemptForeignEmploymentIncome: dollarsOnly('Exempt foreign employment income.'),
    }, ['incomeYear', 'taxableIncome']),
    run({ incomeYear, taxableIncome, reportableFringeBenefits = 0, totalNetInvestmentLoss = 0,
      reportableSuperContributions = 0, exemptForeignEmploymentIncome = 0 }) {
      const r = studyLoanRepayment({
        taxable: String(taxableIncome), fringe: String(reportableFringeBenefits), losses: String(totalNetInvestmentLoss),
        super: String(reportableSuperContributions), foreign: String(exemptForeignEmploymentIncome),
      }, incomeYear);
      return {
        incomeYear, repaymentIncome: dollars(r.repaymentIncome), compulsoryRepayment: dollars(r.repayment),
        method: r.method, currency: 'AUD', source: `${INDIVIDUAL}study-loan/`,
      };
    },
  });
}

/** The downsizer test of ITAA 1997 s 292-102 for the tool's optional downsizer input.
 * @param {typeof import('./downsizer.mjs').downsizer} downsizer @param {Record<string, unknown>} given @param {string} year */
function downsizerOutput(downsizer, given, year) {
  const r = downsizer({ downsizer_contribution: given.contribution, downsizer_contribution_date: given.contributionDate,
    downsizer_age: given.age, downsizer_contract_date: given.contractDate, downsizer_settlement_date: given.settlementDate,
    downsizer_longer_period_allowed: given.longerPeriodAllowed, downsizer_capital_proceeds: given.capitalProceeds,
    downsizer_earlier_own: given.earlierOwn, downsizer_earlier_from_proceeds: given.earlierFromProceeds,
    downsizer_conditions_met: given.conditionsMet }, year);
  return { eligible: r.eligible, covered: r.amounts.downsizer_covered, notCovered: r.amounts.downsizer_not_covered,
    capRemaining: r.amounts.downsizer_cap_remaining, proceedsRemaining: r.amounts.downsizer_proceeds_remaining,
    tests: r.tests.map(({ test, met, finding }) => ({ test, met, finding })) };
}

/**
 * @param {ToolKit} kit
 * @param {typeof import('./concessional-catch-up.mjs').concessionalCatchUp} concessionalCatchUp
 * @param {string[]} catchUpYears
 * @param {typeof import('./downsizer.mjs').downsizer} downsizer
 */
export function concessionalCatchUpTool(kit, concessionalCatchUp, catchUpYears, downsizer) {
  const { text, choice, record, tool, dollars, INDIVIDUAL } = kit;
  return tool({
    name: 'calculate_concessional_catch_up',
    title: 'Concessional contributions catch-up calculator',
    description: `${CATCH_UP_DESCRIPTION}${INDIVIDUAL}concessional-catch-up/.`,
    inputSchema: record({
      incomeYear: choice(catchUpYears, `Income year, ${catchUpYears.at(-1)} to ${catchUpYears[0]}.`),
      totalSuperBalance: text('amount', 'Total super balance on 30 June before the income year, in AUD with at most 2 decimal places.'),
      concessionalContributions: text('amount', 'Concessional contributions for the income year so far, in AUD with at most 2 decimal places.'),
      proposedContribution: text('amount', 'Optional further concessional contribution being considered, in AUD with at most 2 decimal places.'),
      definedBenefit: { type: 'boolean', description: 'true when the person has a defined benefit interest in any fund (refused); false when omitted.' },
      earlierYears: {
        type: 'array', maxItems: 8,
        description: 'Earlier years\' concessional contributions: every year from 5 before incomeYear to the year before it, plus any contiguous earlier years back to 2018-19.',
        items: record({
          year: choice(EARLIER_CATCH_UP_YEARS, 'Earlier income year from 2018-19 to the year before incomeYear.'),
          contributions: text('amount', 'Concessional contributions for that year in AUD with at most 2 decimal places.'),
          totalSuperBalance: text('amount', 'Total super balance on 30 June before that year in AUD; required if that year\'s contributions exceeded its cap.'),
        }, ['year', 'contributions']),
      },
      downsizer: record({
        contribution: text('amount', 'Downsizer contribution in AUD with at most 2 decimal places.'),
        contributionDate: text('date', 'Day the contribution was made, YYYY-MM-DD inside incomeYear.'),
        age: { type: 'integer', minimum: 0, maximum: 150, description: 'Age in whole years on the contribution day.' },
        contractDate: text('date', 'Day the sale contract was entered into, YYYY-MM-DD.'),
        settlementDate: text('date', 'Day ownership changed, YYYY-MM-DD, on or after contractDate and on or before contributionDate.'),
        longerPeriodAllowed: { type: 'boolean', description: 'true when the Commissioner allowed longer than 90 days after the change of ownership.' },
        capitalProceeds: text('amount', 'Capital proceeds from the disposal in AUD.'),
        earlierOwn: text('amount', 'The person’s contributions already covered as downsizer contributions, in AUD.'),
        earlierFromProceeds: text('amount', 'Contributions already covered from these proceeds, by the person or their spouse, in AUD.'),
        conditionsMet: { type: 'boolean', description: 'true when the caller has checked the other conditions of ITAA 1997 s 292-102(1) and (2).' },
      }, ['contribution', 'contributionDate', 'age', 'contractDate', 'settlementDate', 'longerPeriodAllowed', 'capitalProceeds',
        'earlierOwn', 'earlierFromProceeds', 'conditionsMet']),
    }, ['incomeYear', 'totalSuperBalance', 'concessionalContributions', 'earlierYears']),
    run({ incomeYear, totalSuperBalance, concessionalContributions, proposedContribution, definedBenefit = false, earlierYears,
      downsizer: given }) {
      const earlier = earlierYears.map((/** @type {{year: string, contributions: string, totalSuperBalance?: string}} */ e) => ({
        year: e.year, contributions: e.contributions, ...(e.totalSuperBalance === undefined ? {} : { balance: e.totalSuperBalance }),
      }));
      const r = concessionalCatchUp({
        year: incomeYear, balance: totalSuperBalance, concessional: concessionalContributions,
        ...(proposedContribution === undefined ? {} : { proposed: proposedContribution }), definedBenefit, earlier,
      });
      /** @param {Record<string, number>} map */
      const moneyMap = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, dollars(v)]));
      return {
        generalCap: dollars(r.cap), carriesForward: r.carriesForward, unusedCapCarriedForward: dollars(r.unusedCarried),
        availableCap: dollars(r.available), carryForwardApplied: dollars(r.carryForwardApplied),
        remainingCap: dollars(r.remaining), excessConcessionalContributions: dollars(r.excess),
        withProposal: r.withProposal === null ? null : dollars(r.withProposal),
        excessWithProposal: r.excessWithProposal === null ? null : dollars(r.excessWithProposal),
        expiringUnusedCap: dollars(r.expiring),
        earlierApplied: Object.fromEntries(Object.entries(r.earlierApplied).map(([k, v]) => [k, moneyMap(v)])),
        applied: moneyMap(r.applied),
        years: r.years.map((y) => ({ year: y.year, remaining: dollars(y.remaining), expiresAtEndOf: y.expiresAtEndOf })),
        downsizer: given === undefined ? null : downsizerOutput(downsizer, given, incomeYear),
        currency: 'AUD', source: `${INDIVIDUAL}concessional-catch-up/`,
      };
    },
  });
}

/**
 * @param {ToolKit} kit
 * @param {typeof import('./lump-sum-arrears.mjs').lumpSumArrears} lumpSumArrears
 * @param {string[]} receiptYears
 */
export function lumpSumArrearsTool(kit, lumpSumArrears, receiptYears) {
  const { text, choice, whole, record, tool, dollars, dollarsOnly, INDIVIDUAL } = kit;
  return tool({
    name: 'calculate_lump_sum_arrears',
    title: 'Lump sum payment in arrears tax offset calculator',
    description: `${ARREARS_DESCRIPTION}${INDIVIDUAL}lump-sum-arrears/.`,
    inputSchema: record({
      receiptYear: choice(receiptYears, `Income year the arrears were received, ${receiptYears.at(-1)} to ${receiptYears[0]}.`),
      taxableIncome: whole(0, 1e9, 'Taxable income of the receipt year including the arrears, in whole AUD.'),
      netCapitalGain: dollarsOnly('Net capital gain included in the receipt year\'s taxable income.'),
      australianResidentAllYears: {
        type: 'boolean',
        description: 'true when an Australian resident for the whole of the receipt year and each recent accrual year with the full tax-free threshold; false refuses.',
      },
      hasOtherExcludedAmounts: {
        type: 'boolean',
        description: 'true when the receipt year or a recent accrual year included an employment termination payment, unused leave on termination, a super benefit, above-average special professional income or primary producer averaging (refused); false when omitted.',
      },
      accrualYears: {
        type: 'array', maxItems: 50,
        description: 'Earlier income years in which the arrears accrued (at least 1, each year once). The 2 latest accrual years require taxableIncome; distant years take only year and arrears.',
        items: record({
          year: text('incomeYear', 'Accrual income year before receiptYear as YYYY-YY, for example "2023-24".'),
          arrears: whole(1, 1e9, 'Arrears that accrued in this year, in whole AUD.'),
          taxableIncome: whole(0, 1e9, 'Recent accrual year only: its taxable income without these arrears, in whole AUD.'),
          netCapitalGain: whole(0, 1e9, 'Recent accrual year only, and only with 3 or more accrual years: its net capital gain, in whole AUD.'),
          rebateYearArrears: whole(0, 1e9, 'Recent accrual year only: if this offset applied to that year, its total arrears amount in whole AUD.'),
          earlierRebateArrears: whole(0, 1e9, 'Recent accrual year only: arrears of an earlier rebate year that accrued in this year, in whole AUD.'),
        }, ['year', 'arrears']),
      },
    }, ['receiptYear', 'taxableIncome', 'australianResidentAllYears', 'accrualYears']),
    run({ receiptYear, taxableIncome, netCapitalGain = 0, australianResidentAllYears, hasOtherExcludedAmounts = false, accrualYears }) {
      const accrual = accrualYears.map((/** @type {Record<string, any>} */ a) => ({
        year: a.year, arrears: String(a.arrears),
        ...(a.taxableIncome === undefined ? {} : { taxable: String(a.taxableIncome) }),
        ...(a.netCapitalGain === undefined ? {} : { gain: String(a.netCapitalGain) }),
        ...(a.rebateYearArrears === undefined ? {} : { rebateYearArrears: String(a.rebateYearArrears) }),
        ...(a.earlierRebateArrears === undefined ? {} : { earlierRebateArrears: String(a.earlierRebateArrears) }),
      }));
      const r = lumpSumArrears({
        year: receiptYear, resident: australianResidentAllYears, otherAmounts: hasOtherExcludedAmounts,
        taxable: String(taxableIncome), gain: String(netCapitalGain), accrual,
      });
      const pct = (/** @type {number} */ rate) => (rate * 100).toFixed(2);
      return {
        totalArrears: dollars(r.total), normalTaxableIncome: dollars(r.normal), tenPercentThreshold: dollars(r.tenPercent),
        thresholdMet: r.met, taxOnArrears: r.taxOnArrears === null ? null : dollars(r.taxOnArrears),
        notionalByRecentYear: r.notional.map(({ year, amount }) => ({ year, amount: dollars(amount) })),
        distantYears: r.distant ? { years: r.distant.years, amount: dollars(r.distant.amount) } : null,
        recentRatesPercent: r.rates ? {
          mostRecent: pct(r.rates.mostRecent), secondMostRecent: pct(r.rates.secondMostRecent), average: pct(r.rates.average),
        } : null,
        notionalTaxTotal: r.notionalTotal === null ? null : dollars(r.notionalTotal),
        offset: dollars(r.offset), currency: 'AUD', source: `${INDIVIDUAL}lump-sum-arrears/`,
      };
    },
  });
}

/**
 * @param {ToolKit} kit
 * @param {typeof import('./fhss.mjs').fhss} fhss
 */
export function fhssTool(kit, fhss) {
  const { text, choice, record, tool, centsText, INDIVIDUAL } = kit;
  return tool({
    name: 'calculate_fhss_release',
    title: 'First home super saver (FHSS) calculator',
    description: `${FHSS_DESCRIPTION}${INDIVIDUAL}fhss/.`,
    inputSchema: record({
      mode: choice(['stated', 'estimate'], '"stated" for amounts from an ATO determination, or "estimate" for a contribution ledger estimate.'),
      scopeConfirmed: { type: 'boolean', description: 'true to confirm eligible Australian tax resident, eligible accumulation funds and single release; false refuses.' },
      determinationDate: text('date', 'Determination date as YYYY-MM-DD, on or after 2018-07-01 (and through 2026-12-31 for estimate mode).'),
      concessional: text('cost', 'Stated mode: concessional component on the ATO determination (already reduced to 85%), in AUD.'),
      nonConcessional: text('cost', 'Stated mode: non-concessional component on the ATO determination, in AUD.'),
      associatedEarnings: text('cost', 'Stated mode: associated earnings on the ATO determination, in AUD.'),
      actualRelease: text('cost', 'Stated mode: optional actual gross release before withholding and debt offsets, in AUD (requires releaseRequestDate).'),
      determinationRequested: text('date', 'Estimate mode: determination request date as YYYY-MM-DD, from 2018-07-01 to determinationDate.'),
      contributions: {
        type: 'array', maxItems: 10000,
        description: 'Estimate mode: 1 to 10,000 eligible voluntary contributions from 2017-07-01 to determinationDate.',
        items: record({
          date: text('date', 'Contribution date as YYYY-MM-DD.'),
          amount: text('cost', 'Contribution amount above zero in AUD with at most 2 decimal places.'),
          kind: choice(['personal', 'employer_voluntary'], '"personal" or "employer_voluntary" (salary sacrifice).'),
        }, ['date', 'amount', 'kind']),
      },
      deductions: {
        type: 'array', maxItems: 10,
        description: 'Estimate mode: optional personal deductions claimed for personal contributions, at most one per financial year.',
        items: record({
          financialYear: choice(FHSS_DEDUCTION_YEARS, 'Income year of the personal deduction, 2017-18 to 2026-27.'),
          amount: text('cost', 'Personal deduction amount in AUD with at most 2 decimal places.'),
        }, ['financialYear', 'amount']),
      },
      requestedAmount: text('cost', 'Optional amount requested for release in AUD; defaults to maximum release amount.'),
      releaseRequestDate: text('date', 'Optional release request date as YYYY-MM-DD, on or after determinationDate.'),
      withholdingBasis: choice(['marginal', 'unable', 'supplied_estimate', 'actual', 'unknown'],
        'PAYG withholding basis: "marginal" (marginal rate + 2% Medicare levy - 30% offset), "unable" (17%), "supplied_estimate", "actual" or "unknown".'),
      marginalPercent: text('percent', 'Required for withholdingBasis "marginal": estimated marginal tax rate from 0 to 45 per cent, for example "30".'),
      withholdingAmount: text('cost', 'Required for withholdingBasis "supplied_estimate" or "actual": amount withheld in AUD.'),
      debtOffset: text('cost', 'Optional Commonwealth debt offset in AUD; omit if unknown.'),
      transition: choice(['ordinary', 'item30'], 'Optional transitional rule for determinations before 2024-09-15: "ordinary" or "item30".'),
    }, ['mode', 'scopeConfirmed', 'determinationDate', 'withholdingBasis']),
    run(input) {
      const forbidden = input.mode === 'stated' ? FHSS_ESTIMATE_FIELDS : FHSS_STATED_FIELDS;
      const supplied = new Map(Object.entries(input));
      const wrong = forbidden.find((key) => supplied.get(key) !== undefined);
      if (wrong) throw new Error(`${wrong} applies only when mode is "${input.mode === 'stated' ? 'estimate' : 'stated'}".`);
      if (input.marginalPercent !== undefined && input.withholdingBasis !== 'marginal') {
        throw new Error('marginalPercent applies only when withholdingBasis is "marginal".');
      }
      if (input.withholdingAmount !== undefined && !['supplied_estimate', 'actual'].includes(input.withholdingBasis)) {
        throw new Error('withholdingAmount applies only when withholdingBasis is "supplied_estimate" or "actual".');
      }
      if (input.transition !== undefined && input.determinationDate >= '2024-09-15') {
        throw new Error('transition applies only to determinations before 2024-09-15.');
      }
      const deductions = input.deductions?.map((/** @type {{financialYear: string, amount: string}} */ d) => ({
        financial_year: d.financialYear, amount: d.amount,
      }));
      const r = fhss(/** @type {import('./fhss.mjs').FhssFacts} */ ({ ...input, deductions }));
      const notes = [];
      if (r.earningsBasis === 'estimate') {
        notes.push('Contribution estimate uses published SIC rates floored to whole dollars per contribution; for ATO GN 2024/1 example 6 (Jill) this gives $7,859 vs ATO $5,190 (unresolved). Use ATO determination amounts when available.');
      }
      if (r.releaseBasis === 'assumed') notes.push('Assessable amount uses the assumed gross release; recalculate once actual gross release is known.');
      if (r.transition === 'unconfirmed') notes.push('Determination predates 15 September 2024: confirm ordinary vs item 30 transitional treatment.');
      const seenRows = new Set();
      return {
        determinationYear: r.determinationYear, assessableYear: r.assessableYear, earningsBasis: r.earningsBasis,
        releaseBasis: r.releaseBasis, withholdingBasis: r.withholdingBasis, transition: r.transition,
        concessionalComponent: r.amounts.concessional_component, nonConcessionalComponent: r.amounts.non_concessional_component,
        associatedEarnings: r.amounts.associated_earnings, maximumReleaseAmount: r.amounts.maximum_release_amount,
        amountRequested: r.amounts.amount_requested, grossRelease: r.amounts.gross_release,
        assessableFhssReleasedAmount: r.amounts.assessable_fhss_released_amount, taxWithheld: r.amounts.tax_withheld,
        afterWithholding: r.amounts.after_withholding, debtOffset: r.amounts.debt_offset, paidToYou: r.amounts.paid_to_you,
        fhssTaxOffset: r.amounts.fhss_tax_offset, fhssTaxIfNotUsed: r.amounts.fhss_tax_if_not_used,
        recontributionRequired: r.amounts.recontribution_required, annualLimit: r.annualLimit, lifetimeLimit: r.lifetimeLimit,
        contributions: r.rows.map((row) => {
          const duplicateRow = seenRows.has(row.row);
          seenRows.add(row.row);
          return {
            row: row.row, date: row.date, financialYear: row.year, kind: row.type, concessional: row.concessional,
            amount: centsText(row.amount), counted: centsText(row.counted), earningsFrom: row.earningsFrom,
            deemedEarnings: duplicateRow ? null : `${row.earnings}.00`,
          };
        }),
        notes, currency: 'AUD', source: `${INDIVIDUAL}fhss/`,
      };
    },
  });
}

const WORK_EXPENSE_FIELDS = /** @type {const} */ ([
  ['hours', 'hours'], ['energy', 'energy'], ['phone', 'phone'], ['internet', 'internet'], ['stationery', 'stationery'],
  ['cleaning', 'cleaning'], ['furnitureDecline', 'furniture_decline'], ['assetDecline', 'asset_decline'], ['repairs', 'repairs'],
  ['runningExpensesIncurred', 'running_expenses_incurred'], ['dedicatedHomeOffice', 'dedicated_home_office'],
  ['ownedOrLeased', 'owned_or_leased'], ['businessKilometres', 'business_kilometres'], ['totalKilometres', 'total_kilometres'],
  ['carExpenses', 'car_expenses'], ['logBookYear', 'log_book_year'], ['logBookRepresentative', 'log_book_representative'],
  ['connection', 'connection'], ['employedWhenIncurred', 'employed_when_incurred'],
  ['categoryA', 'category_a'], ['categoryB', 'category_b'], ['categoryC', 'category_c'], ['categoryD', 'category_d'],
  ['logBookCarInCategoryA', 'log_book_car_in_category_a'], ['prescribedCourse', 'prescribed_course'], ['categoryE', 'category_e'],
]);
const HOME_EXPENSE_DEFAULTS = ['energy', 'phone', 'internet', 'stationery', 'cleaning', 'furniture_decline', 'asset_decline', 'repairs'];
const EDUCATION_CATEGORY_DEFAULTS = ['category_a', 'category_b', 'category_c', 'category_d'];

const WORK_EXPENSE_DEFAULTS = new Map([
  ['home_office', HOME_EXPENSE_DEFAULTS],
  ['self_education', EDUCATION_CATEGORY_DEFAULTS],
]);

/**
 * @param {Record<string, any>} input
 * @returns {import('./work-expenses.mjs').WorkExpensesFacts}
 */
function workExpensesFacts(input) {
  const supplied = new Map(Object.entries(input));
  /** @type {Map<string, unknown>} */
  const out = new Map([
    ['method', input.method], ['year', input.incomeYear], ['scope_confirmed', input.scopeConfirmed],
    ['reimbursed', input.reimbursed ?? false], ['allowance_received', input.allowanceReceived ?? false],
  ]);
  for (const [prop, key] of WORK_EXPENSE_FIELDS) {
    const value = supplied.get(prop);
    if (value !== undefined) out.set(key, value);
  }
  if (input.logBookWeeks !== undefined) out.set('log_book_weeks', String(input.logBookWeeks));
  for (const key of WORK_EXPENSE_DEFAULTS.get(input.method) ?? []) {
    if (out.get(key) === undefined) out.set(key, '0');
  }
  if (input.method === 'self_education' && ['2020-21', '2021-22'].includes(input.incomeYear) && input.prescribedCourse === true) {
    if (out.get('category_e') === undefined) out.set('category_e', '0');
  }
  return /** @type {import('./work-expenses.mjs').WorkExpensesFacts} */ (Object.fromEntries(out));
}

/** @param {ReturnType<typeof import('./work-expenses.mjs').workExpenses>} r @param {string} source */
function workExpensesPayload(r, source) {
  /** @type {Record<string, unknown>} */
  const payload = { method: r.method, incomeYear: r.year, amounts: r.amounts, rates: r.rates };
  if (r.methodsAvailable) {
    payload.methodsAvailable = r.methodsAvailable;
    payload.higherMethod = r.higherMethod;
    payload.fixedRateUnavailable = r.fixedRateUnavailable;
  }
  if (r.kilometresDiscarded !== undefined) payload.kilometresDiscarded = r.kilometresDiscarded;
  if (r.logBookValidTo) payload.logBookValidTo = r.logBookValidTo;
  if (r.deductible !== undefined) {
    payload.deductible = r.deductible;
    payload.reductionApplies = r.reductionApplies;
  }
  payload.currency = 'AUD';
  payload.source = source;
  return payload;
}

/**
 * @param {ToolKit} kit
 * @param {typeof import('./work-expenses.mjs').workExpenses} workExpenses
 * @param {string[]} workExpensesYears
 */
export function workExpensesTool(kit, workExpenses, workExpensesYears) {
  const { text, choice, whole, record, tool, INDIVIDUAL } = kit;
  return tool({
    name: 'calculate_work_expenses',
    title: 'Work expenses calculator',
    description: `${WORK_EXPENSES_DESCRIPTION}${INDIVIDUAL}work-expenses/.`,
    inputSchema: record({
      method: choice(['home_office', 'car_cents_per_kilometre', 'car_log_book', 'self_education'],
        'Deduction method: "home_office", "car_cents_per_kilometre", "car_log_book" or "self_education".'),
      incomeYear: choice(workExpensesYears, `Income year, ${workExpensesYears[0]} to ${workExpensesYears.at(-1)}.`),
      scopeConfirmed: { type: 'boolean', description: 'true to confirm figures are work-related amounts from your records; false refuses.' },
      reimbursed: { type: 'boolean', description: 'true when reimbursed or paid by an employer or anyone else (refused); false when omitted.' },
      allowanceReceived: { type: 'boolean', description: 'true when an allowance was received for these expenses (refused); false when omitted.' },
      hours: text('amount', 'home_office: recorded hours worked from home (up to 2 decimal places).'),
      runningExpensesIncurred: { type: 'boolean', description: 'home_office: true when additional running expenses were incurred from working from home.' },
      dedicatedHomeOffice: { type: 'boolean', description: 'home_office, 2020-21 and 2021-22 only: true when there was a dedicated home office.' },
      energy: text('cost', 'home_office: work-related electricity and gas in AUD; "0" when omitted.'),
      phone: text('cost', 'home_office: work-related mobile and home phone in AUD; "0" when omitted.'),
      internet: text('cost', 'home_office: work-related internet in AUD; "0" when omitted.'),
      stationery: text('cost', 'home_office: work-related stationery and consumables in AUD; "0" when omitted.'),
      cleaning: text('cost', 'home_office: work-related cleaning in AUD; "0" when omitted.'),
      furnitureDecline: text('cost', 'home_office: work-related decline in value of home office furniture in AUD; "0" when omitted.'),
      assetDecline: text('cost', 'home_office: work-related decline in value of other assets in AUD; "0" when omitted.'),
      repairs: text('cost', 'home_office: work-related repairs to those assets in AUD; "0" when omitted.'),
      ownedOrLeased: { type: 'boolean', description: 'car_cents_per_kilometre or car_log_book: true when the car was owned or leased; false refuses.' },
      businessKilometres: text('cost', 'car_cents_per_kilometre or car_log_book: business kilometres in the year (up to 2 decimal places).'),
      totalKilometres: text('cost', 'car_log_book: total kilometres in the year (up to 2 decimal places).'),
      carExpenses: text('cost', 'car_log_book: deductible car expenses including decline in value in AUD.'),
      logBookYear: text('incomeYear', 'car_log_book: income year the log book was kept as YYYY-YY, serving that year and the next 4.'),
      logBookWeeks: whole(12, 53, 'car_log_book: continuous whole weeks the log book covers, 12 to 53.'),
      logBookRepresentative: { type: 'boolean', description: 'car_log_book: true when the log book still represents the car\'s business use; false refuses.' },
      connection: choice(['maintains_or_improves_skills', 'increases_income', 'general_only', 'new_employment'],
        'self_education: how the study related to current employment when incurred.'),
      employedWhenIncurred: { type: 'boolean', description: 'self_education: true when employed at the time the expenses were incurred.' },
      categoryA: text('cost', 'self_education: Category A expenses (fees, books, stationery, fares, log book car costs other than decline in value) in AUD; "0" when omitted.'),
      categoryB: text('cost', 'self_education: Category B decline in value in AUD; "0" when omitted.'),
      categoryC: text('cost', 'self_education: Category C repairs in AUD; "0" when omitted.'),
      categoryD: text('cost', 'self_education: Category D cents per kilometre car expenses in AUD; "0" when omitted.'),
      logBookCarInCategoryA: { type: 'boolean', description: 'self_education: true when Category A includes log book car expenses (required when categoryD > 0).' },
      prescribedCourse: { type: 'boolean', description: 'self_education, 2020-21 and 2021-22 only: true for a prescribed course of education.' },
      categoryE: text('cost', 'self_education, 2020-21 and 2021-22 with prescribedCourse true only: non-deductible Category E expenses in AUD; "0" when omitted.'),
    }, ['method', 'incomeYear', 'scopeConfirmed']),
    run(input) {
      const r = workExpenses(workExpensesFacts(input));
      return workExpensesPayload(r, `${INDIVIDUAL}work-expenses/`);
    },
  });
}

const GOV_SUPER_INCOME_KEYS = /** @type {Record<string, string>} */ ({
  taxableIncome: 'taxable_income', assessableFhssReleasedAmount: 'assessable_fhss_released_amount',
  familyTrustDistributionAmounts: 'family_trust_distribution_amounts',
  reportableFringeBenefitsSection57a: 'reportable_fringe_benefits_section_57a',
  reportableFringeBenefitsOther: 'reportable_fringe_benefits_other',
  reportableEmployerSuperContributions: 'reportable_employer_super_contributions',
  deductiblePersonalSuperContributions: 'deductible_personal_super_contributions',
  excessConcessionalContributions: 'excess_concessional_contributions',
  netFinancialInvestmentLoss: 'net_financial_investment_loss', netRentalPropertyLoss: 'net_rental_property_loss',
  taxFreeGovernmentPensions: 'tax_free_government_pensions', targetForeignIncome: 'target_foreign_income',
  exemptForeignEmploymentIncome: 'exempt_foreign_employment_income', childSupportPaid: 'child_support_paid',
  assessableIncome: 'assessable_income', businessDeductions: 'business_deductions',
});

/**
 * @param {ToolKit} kit
 * @param {typeof import('./government-super.mjs').governmentSuperAmounts} governmentSuperAmounts
 * @param {string[]} governmentSuperYears
 */
export function governmentSuperTool(kit, governmentSuperAmounts, governmentSuperYears) {
  const { text, choice, whole, record, tool, dollarsOnly, INDIVIDUAL, INCOME_TEST_INPUTS } = kit;
  const incomeSchema = Object.fromEntries(INCOME_TEST_INPUTS.map(([name, , description]) => [
    name, name === 'taxableIncome' || name === 'assessableIncome' ? whole(0, 1e9, `${description} In whole AUD.`) : dollarsOnly(description),
  ]));
  return tool({
    name: 'calculate_government_super_amounts',
    title: 'Government super amounts calculator',
    description: `${GOVERNMENT_SUPER_DESCRIPTION}${INDIVIDUAL}government-super/.`,
    inputSchema: record({
      incomeYear: choice(governmentSuperYears, `Income year, ${governmentSuperYears[0]} to ${governmentSuperYears.at(-1)}.`),
      scopeConfirmed: { type: 'boolean', description: 'true to confirm the amounts and answers are established for the year; false refuses.' },
      residency: choice(['full_year_resident', 'part_year_resident', 'working_holiday_maker', 'foreign_resident'],
        'Residency status: only "full_year_resident" computes; other values refuse.'),
      temporaryVisaHeld: { type: 'boolean', description: 'true if a temporary visa was held at any time in the year (refused); false when omitted.' },
      ...incomeSchema,
      eligibleIncome: text('cost', 'Income from employment or carrying on a business before business deductions, in AUD.'),
      personalContributions: text('cost', 'Personal non-deducted super contributions received by the fund in the year, in AUD; "0" when omitted.'),
      concessionalContributions: text('cost', 'Concessional contributions (employer, salary sacrifice and deducted personal) for LISTO, in AUD; "0" when omitted.'),
      returnLodged: { type: 'boolean', description: 'true when the tax return for the year is lodged.' },
      under71: { type: 'boolean', description: 'true when under age 71 at the end of the income year.' },
      nonConcessionalWithinCap: choice(['yes', 'no', 'unknown'],
        'Whether non-concessional contributions are within the cap: "yes", "no" or "unknown" ("unknown" when omitted; refused if it decides co-contribution).'),
      totalSuperBalanceBelowCap: choice(['yes', 'no', 'unknown'],
        'Whether total super balance on 30 June before the year was below the general transfer balance cap: "yes", "no" or "unknown" ("unknown" when omitted; refused if it decides co-contribution).'),
      spouse: record({
        contributions: text('cost', 'Non-deductible contributions made to the spouse\'s super fund in AUD.'),
        assessableIncome: text('cost', 'Spouse\'s assessable income in AUD.'),
        assessableFhssReleasedAmount: text('cost', 'Spouse\'s assessable FHSS released amount in AUD; "0" when omitted.'),
        reportableFringeBenefitsTotal: text('cost', 'Spouse\'s reportable fringe benefits total in AUD; "0" when omitted.'),
        reportableEmployerSuperContributions: text('cost', 'Spouse\'s reportable employer super contributions in AUD; "0" when omitted.'),
        excessConcessionalContributions: text('cost', 'Spouse\'s excess concessional contributions in AUD; "0" when omitted.'),
        nonConcessionalWithinCap: choice(['yes', 'no', 'unknown'], 'Whether the spouse\'s non-concessional contributions are within cap; "unknown" when omitted.'),
        totalSuperBalanceBelowCap: choice(['yes', 'no', 'unknown'], 'Whether the spouse\'s prior 30 June total super balance was below the general transfer balance cap; "unknown" when omitted.'),
      }, ['contributions', 'assessableIncome']),
    }, ['incomeYear', 'scopeConfirmed', 'residency', 'assessableIncome', 'taxableIncome', 'eligibleIncome', 'returnLodged', 'under71']),
    run(input) {
      const supplied = new Map(Object.entries(input));
      /** @type {import('./government-super.mjs').GovernmentSuperFacts} */
      const facts = {
        ...Object.fromEntries(Object.entries(GOV_SUPER_INCOME_KEYS).map(([prop, key]) => [key, String(supplied.get(prop) ?? 0)])),
        year: input.incomeYear, scope_confirmed: input.scopeConfirmed, residency: input.residency,
        temporary_visa_held: input.temporaryVisaHeld ?? false, eligible_income: input.eligibleIncome,
        personal_contributions: input.personalContributions ?? '0', concessional_contributions: input.concessionalContributions ?? '0',
        return_lodged: input.returnLodged, under_71: input.under71,
        non_concessional_within_cap: triState(input.nonConcessionalWithinCap ?? 'unknown'),
        total_super_balance_below_cap: triState(input.totalSuperBalanceBelowCap ?? 'unknown'),
      };
      if (input.spouse) {
        Object.assign(facts, {
          spouse_contributions: input.spouse.contributions, spouse_assessable_income: input.spouse.assessableIncome,
          spouse_assessable_fhss_released_amount: input.spouse.assessableFhssReleasedAmount ?? '0',
          spouse_reportable_fringe_benefits_total: input.spouse.reportableFringeBenefitsTotal ?? '0',
          spouse_reportable_employer_super_contributions: input.spouse.reportableEmployerSuperContributions ?? '0',
          spouse_excess_concessional_contributions: input.spouse.excessConcessionalContributions ?? '0',
          spouse_non_concessional_within_cap: triState(input.spouse.nonConcessionalWithinCap ?? 'unknown'),
          spouse_total_super_balance_below_cap: triState(input.spouse.totalSuperBalanceBelowCap ?? 'unknown'),
        });
      }
      const r = governmentSuperAmounts(facts);
      return {
        incomeYear: r.year, amounts: r.amounts, conditions: r.conditions,
        thresholds: { lowerIncomeThreshold: r.rates.lower_income_threshold, higherIncomeThreshold: r.rates.higher_income_threshold },
        currency: 'AUD', source: `${INDIVIDUAL}government-super/`,
      };
    },
  });
}
