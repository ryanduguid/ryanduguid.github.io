// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for PAYG instalments, payroll tax, salary against dividends,
// SGC and Payday Super, and staff cost. Imported by assets/webmcp-business-b.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

const PAYROLL_TAX_PLACES = [
  'AU-NSW', 'AU-VIC', 'AU-VIC-REGIONAL', 'AU-QLD', 'AU-WA', 'AU-SA', 'AU-TAS', 'AU-ACT', 'AU-NT',
];

const SALARY_DIVIDEND_YEARS = ['2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];

const PAYDAY_TIMINGS = [
  'standard', 'first', 'out-of-cycle', 'exceptional', 'first-out-of-cycle', 'out-of-cycle-exceptional',
];

const PAYG_COMMON = new Set(['method']);
const PAYG_ALLOWED = new Map([
  ['amount', new Set(['notifiedAmount'])],
  ['varied-amount', new Set(['instalmentNumber', 'estimatedTax', 'earlierInstalments', 'earlierCredits'])],
  ['rate', new Set(['instalmentIncome', 'instalmentRatePercent'])],
  ['varied-rate', new Set(['instalmentIncome', 'estimatedTax', 'estimatedIncome', 'previousRatePercent', 'earlierInstalments', 'earlierCredits', 'earlierIncome'])],
]);
const PAYG_REQUIRED = new Map([
  ['amount', ['notifiedAmount']],
  ['varied-amount', ['instalmentNumber', 'estimatedTax']],
  ['rate', ['instalmentIncome', 'instalmentRatePercent']],
  ['varied-rate', ['instalmentIncome', 'estimatedTax', 'estimatedIncome', 'previousRatePercent']],
]);

const SGC_COMMON = new Set(['regime', 'norfolkIsland']);
const SGC_ALLOWED = new Map([
  ['payday', new Set([
    'payday', 'timing', 'nextPayday', 'determinationDate', 'qualifyingEarnings', 'earlierEarnings',
    'receivedOnTime', 'receivedLate', 'lateReceiptDate', 'assessmentDate', 'disqualifyingAssessment',
    'voluntaryDisclosureDate', 'assumedGicRate',
  ])],
  ['quarter', new Set([
    'incomeYear', 'quarter', 'salaryOrWages', 'ordinaryTimeEarnings', 'contributionsOnTime', 'statementLodgedDate',
  ])],
]);
const SGC_REQUIRED = new Map([
  ['payday', ['payday', 'qualifyingEarnings']],
  ['quarter', ['incomeYear', 'quarter', 'salaryOrWages', 'ordinaryTimeEarnings', 'statementLodgedDate']],
]);

/**
 * Refuses fields belonging to another mode and ensures every required field for this mode is supplied.
 * @param {Record<string, unknown>} input
 * @param {string} mode
 * @param {Map<string, Set<string>>} allowedMap
 * @param {Map<string, string[]>} requiredMap
 * @param {Set<string>} commonKeys
 */
export function checkModeFields(input, mode, allowedMap, requiredMap, commonKeys) {
  const allowed = allowedMap.get(mode) ?? new Set();
  const supplied = new Map(Object.entries(input));
  for (const key of supplied.keys()) {
    if (!commonKeys.has(key) && !allowed.has(key)) {
      throw new Error(`${key} does not apply when using "${mode}".`);
    }
  }
  for (const key of requiredMap.get(mode) ?? []) {
    if (supplied.get(key) === undefined) {
      throw new Error(`${key} is required for "${mode}".`);
    }
  }
}

/** @param {ToolKit} kit @param {BusinessCalculators['paygInstalment']} paygInstalment */
export function paygInstalmentsTool(kit, paygInstalment) {
  const { text, choice, whole, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_payg_instalment',
    title: 'PAYG instalments calculator',
    description: 'One quarterly PAYG instalment in AUD under TAA 1953 Schedule 1 Division 45: notified amount at T7 (s 45-112), '
      + 'varied amount from estimated benchmark tax (s 45-410), instalment income times rate at T2 (s 45-110), or varied rate '
      + '(s 45-205) with any credit at 5B when lower than the previous quarter\'s rate (s 45-215). Activity statement figures '
      + 'drop cents to whole dollars. Refuses fields belonging to another method; does not cover monthly, 2-instalment or annual payers.',
    inputSchema: record({
      method: choice(['amount', 'varied-amount', 'rate', 'varied-rate'], 'Quarterly PAYG instalment method.'),
      notifiedAmount: text('cost', 'Method "amount" only: notified instalment amount at T7 in AUD.'),
      instalmentNumber: whole(1, 4, 'Method "varied-amount" only: quarter number of the income year, 1 (25%) to 4 (100%).'),
      estimatedTax: text('cost', 'Method "varied-amount" or "varied-rate": estimated tax on instalment income for the year at T8 in AUD.'),
      earlierInstalments: text('cost', 'Method "varied-amount" or "varied-rate": earlier instalments this income year at 5A in AUD; "0" when omitted.'),
      earlierCredits: text('cost', 'Method "varied-amount" or "varied-rate": earlier credits this income year in AUD; "0" when omitted.'),
      instalmentIncome: text('cost', 'Method "rate" or "varied-rate": instalment income for the quarter at T1 in AUD.'),
      instalmentRatePercent: text('percent', 'Method "rate" only: ATO instalment rate at T2 in per cent (0 to 100).'),
      estimatedIncome: text('cost', 'Method "varied-rate" only: estimated instalment income for the year in AUD.'),
      earlierIncome: text('cost', 'Method "varied-rate" only: instalment income of earlier quarters in AUD; "0" when omitted.'),
      previousRatePercent: text('percent', 'Method "varied-rate" only: instalment rate used for the previous quarter in per cent ("0" for quarter 1).'),
    }, ['method']),
    run(input) {
      checkModeFields(input, input.method, PAYG_ALLOWED, PAYG_REQUIRED, PAYG_COMMON);
      const r = paygInstalment({
        method: input.method,
        notified: input.notifiedAmount ?? '0',
        instalment: input.instalmentNumber === undefined ? '1' : String(input.instalmentNumber),
        estimatedTax: input.estimatedTax ?? '0',
        earlier: input.earlierInstalments ?? '0',
        credits: input.earlierCredits ?? '0',
        income: input.instalmentIncome ?? '0',
        rate: input.instalmentRatePercent ?? '0',
        estimatedIncome: input.estimatedIncome ?? '0',
        earlierIncome: input.earlierIncome ?? '0',
        previousRate: input.previousRatePercent ?? '0',
      });
      return {
        method: input.method,
        calculatedAmount: dollars(r.amount),
        instalmentWholeDollars: String(r.instalment),
        creditWholeDollars: String(r.credit),
        dueToDate: r.due === null ? null : dollars(r.due),
        instalmentRatePercent: r.instalmentRate === null ? null : r.instalmentRate.toFixed(2),
        currency: 'AUD',
        source: `${CALCULATORS}payg-instalments/`,
      };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['payrollTax']} payrollTax */
export function payrollTaxTool(kit, payrollTax) {
  const { text, choice, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_payroll_tax',
    title: 'Payroll tax calculator',
    description: 'Annual 2026-27 payroll tax in AUD for one non-grouped employer paying wages all year in one Australian '
      + 'state or territory (including Victoria\'s regional employer rate, Victoria\'s mental health and COVID-19 debt '
      + 'surcharges and Queensland\'s mental health levy), apportioning thresholds and deductions when interstate wages '
      + 'are supplied. Does not cover grouped employers, part-year employment, rebates, exemptions or other years.',
    inputSchema: record({
      place: choice(PAYROLL_TAX_PLACES, 'State or territory, including "AU-VIC-REGIONAL" for a Victorian regional employer.'),
      wages: text('cost', 'Taxable wages in the chosen state or territory for 2026-27 in AUD with at most 2 decimal places.'),
      australianWages: text('cost', 'Total Australian taxable and interstate wages for 2026-27 in AUD; omit when all wages are paid in this jurisdiction.'),
    }, ['place', 'wages']),
    run({ place, wages, australianWages = '' }) {
      const r = payrollTax(wages, australianWages, place);
      return {
        incomeYear: '2026-27',
        place,
        deduction: dollars(r.deduction),
        taxableWages: dollars(r.taxable),
        payrollTax: dollars(r.tax),
        levy: dollars(r.levy),
        extraLevy: dollars(r.extraLevy),
        total: dollars(r.total),
        lines: r.lines.map((line) => ({ rate: line.rate, on: dollars(line.on), amount: dollars(line.amount) })),
        currency: 'AUD',
        source: `${CALCULATORS}payroll-tax/`,
      };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['salaryDividend']} salaryDividend */
export function salaryDividendTool(kit, salaryDividend) {
  const { text, choice, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_salary_vs_dividend',
    title: 'Salary against dividends calculator',
    description: 'Compare one Australian resident company owner\'s salary plus super guarantee against fully franked dividends '
      + 'for 2021-22 to 2026-27 in AUD when all company profit is paid out: company tax (25% base rate entity or 30%), '
      + 'franking credit, owner income tax and Medicare levy (with the $1,000 standard deduction from 2026-27), 15% super '
      + 'contributions tax and Division 293 tax, cash and super kept after tax, and the split that keeps the most. Assumes '
      + 'private hospital cover and no other concessional contributions, work deductions, study loans or retained profits.',
    inputSchema: record({
      incomeYear: choice(SALARY_DIVIDEND_YEARS, 'Income year from 2021-22 to 2026-27.'),
      companyProfit: text('cost', 'Company taxable profit before the owner\'s salary and super guarantee, in AUD.'),
      baseRateEntity: { type: 'boolean', description: 'true when the company is a base rate entity this year and last year (25% tax and franking); false for 30%.' },
      salary: text('cost', 'Salary paid to the owner in AUD; companyProfit must also cover its super guarantee.'),
      otherTaxableIncome: text('cost', 'Owner\'s other taxable income in AUD; "0" when omitted.'),
    }, ['incomeYear', 'companyProfit', 'baseRateEntity', 'salary']),
    run({ incomeYear, companyProfit, baseRateEntity, salary, otherTaxableIncome = '0' }) {
      const r = salaryDividend({ year: incomeYear, profit: companyProfit, baseRate: baseRateEntity, salary, other: otherTaxableIncome });
      return {
        incomeYear,
        salary: dollars(r.salary),
        superGuarantee: dollars(r.superGuarantee),
        companyTax: dollars(r.companyTax),
        dividend: dollars(r.dividend),
        frankingCredit: dollars(r.credit),
        ownerTaxableIncome: dollars(r.taxable),
        ownerExtraTax: dollars(r.ownerTax),
        superTax: dollars(r.superTax),
        division293Tax: dollars(r.division293),
        cashKept: dollars(r.cash),
        superKept: dollars(r.superNet),
        totalKept: dollars(r.kept),
        maxSalary: dollars(r.largest),
        allSalaryTotalKept: dollars(r.allSalary),
        allDividendsTotalKept: dollars(r.allDividends),
        bestSplit: {
          salary: dollars(r.bestSalary),
          cashKept: dollars(r.bestCash),
          superKept: dollars(r.bestSuper),
          totalKept: dollars(r.bestKept),
        },
        currency: 'AUD',
        source: `${CALCULATORS}salary-dividend/`,
      };
    },
  });
}

/** @param {Record<string, any>} input */
function checkPaydayTimingInputs(input) {
  const timing = input.timing ?? 'standard';
  const needsNext = timing.includes('out-of-cycle');
  const needsDetermination = timing.includes('exceptional');
  if (needsNext && input.nextPayday === undefined) {
    throw new Error('nextPayday is required for out-of-cycle timing.');
  }
  if (!needsNext && input.nextPayday !== undefined) {
    throw new Error('nextPayday applies only to out-of-cycle timing.');
  }
  if (needsDetermination && input.determinationDate === undefined) {
    throw new Error('determinationDate is required for exceptional circumstances timing.');
  }
  if (!needsDetermination && input.determinationDate !== undefined) {
    throw new Error('determinationDate applies only to exceptional circumstances timing.');
  }
  const late = input.receivedLate ?? '0';
  if (Number(late) === 0 && input.lateReceiptDate !== undefined) {
    throw new Error('lateReceiptDate applies only when receivedLate is above zero.');
  }
}

/**
 * @param {Record<string, any>} input
 * @param {BusinessCalculators['paydaySuperCharge']} paydaySuperCharge
 * @param {(value: number) => string} dollars
 * @param {string} source
 */
function runSgcPayday(input, paydaySuperCharge, dollars, source) {
  checkPaydayTimingInputs(input);
  const r = paydaySuperCharge({
    payday: input.payday,
    timing: input.timing ?? 'standard',
    nextPayday: input.nextPayday ?? input.payday,
    determination: input.determinationDate ?? input.payday,
    earnings: input.qualifyingEarnings,
    earlier: input.earlierEarnings ?? '0',
    onTime: input.receivedOnTime ?? '0',
    late: input.receivedLate ?? '0',
    received: input.lateReceiptDate ?? '',
    assessment: input.assessmentDate ?? '',
    assessed: input.disqualifyingAssessment ? 'yes' : 'no',
    disclosure: input.voluntaryDisclosureDate ? 'lodged' : 'none',
    lodged: input.voluntaryDisclosureDate ?? '',
    assumedRate: input.assumedGicRate ?? '11.51',
  });
  if (r.assumedDays > 0 && input.assumedGicRate === undefined) {
    throw new Error('assumedGicRate is required when notional earnings accrue after 2026-12-31.');
  }
  return {
    regime: 'payday',
    dueDate: r.due,
    dueRule: r.rule,
    sgAmount: dollars(r.sgAmount),
    baseShortfall: dollars(r.base),
    lateContributionsApplied: dollars(r.applied),
    finalShortfall: dollars(r.final),
    businessDaysToReceipt: r.businessDays,
    daysLate: r.daysLate,
    earningsTo: r.earningsTo,
    earningsDays: r.days,
    assumedGicDays: r.assumedDays,
    notionalEarnings: dollars(r.notional),
    upliftPercent: r.upliftPercent,
    administrativeUplift: dollars(r.uplift),
    sgCharge: dollars(r.charge),
    currency: 'AUD',
    source,
  };
}

/**
 * @param {Record<string, any>} input
 * @param {BusinessCalculators['quarterlySgCharge']} quarterlySgCharge
 * @param {(value: number) => string} dollars
 * @param {string} source
 */
function runSgcQuarter(input, quarterlySgCharge, dollars, source) {
  const r = quarterlySgCharge({
    year: input.incomeYear,
    quarter: input.quarter,
    wages: input.salaryOrWages,
    ote: input.ordinaryTimeEarnings,
    contributions: input.contributionsOnTime ?? '0',
    lodged: input.statementLodgedDate,
  });
  return {
    regime: 'quarter',
    quarterStart: r.start,
    contributionsDue: r.contributionsDue,
    lodgmentDay: r.lodgmentDay,
    payableDate: r.payable,
    chargePercent: r.chargePercent.toFixed(2),
    shortfall: dollars(r.shortfall),
    nominalInterestDays: r.days,
    nominalInterest: dollars(r.interest),
    administrationComponent: dollars(r.administration),
    sgCharge: dollars(r.charge),
    currency: 'AUD',
    source,
  };
}

/**
 * @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'paydaySuperCharge' | 'quarterlySgCharge'>} calculate
 */
export function sgcPaydayTool(kit, calculate) {
  const { text, choice, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_sgc_payday',
    title: 'SGC and Payday Super due date calculator',
    description: 'Superannuation guarantee due date and charge in AUD for one employee under 2026-27 Payday Super '
      + '(SGAA 1992 ss 16B, 17A, 18C, 18D, 19A and 19B; 12% on qualifying earnings up to $270,830, notional earnings '
      + 'compounding at daily GIC and administrative uplift under regs 13C-13D) or under the 2022-23 to 2025-26 quarterly '
      + 'law (shortfall, 10% nominal interest and $20 administration component). Refuses Norfolk Island wages and fields '
      + 'from the other regime. Does not cover choice loading or late payment offsets.',
    inputSchema: record({
      regime: choice(['payday', 'quarter'], '"payday" for 2026-27 Payday Super, or "quarter" for 2022-23 to 2025-26 quarterly super.'),
      norfolkIsland: { type: 'boolean', description: 'true when any of the pay is Norfolk Island salary or wages (refused); false when omitted.' },
      payday: text('date', 'Payday regime: payday (QE day) as YYYY-MM-DD, from 2026-07-01 to 2027-06-30.'),
      timing: choice(PAYDAY_TIMINGS, 'Payday regime: due-date period under s 18C(2); "standard" (7 business days) when omitted.'),
      nextPayday: text('date', 'Payday regime with out-of-cycle timing only: next scheduled regular payday as YYYY-MM-DD.'),
      determinationDate: text('date', 'Payday regime with exceptional timing only: date ATO determination was made as YYYY-MM-DD.'),
      qualifyingEarnings: text('cost', 'Payday regime: qualifying earnings paid on the payday in AUD, above zero.'),
      earlierEarnings: text('cost', 'Payday regime: earlier qualifying earnings in 2026-27 in AUD; "0" when omitted.'),
      receivedOnTime: text('cost', 'Payday regime: contributions received by the fund on time in AUD; "0" when omitted.'),
      receivedLate: text('cost', 'Payday regime: late contributions received before the assessment day in AUD; "0" when omitted.'),
      lateReceiptDate: text('date', 'Payday regime with receivedLate > 0: date the fund received late contributions, YYYY-MM-DD.'),
      assessmentDate: text('date', 'Payday regime with a base shortfall: assessment date as YYYY-MM-DD (after due date, to 2031-06-30).'),
      disqualifyingAssessment: { type: 'boolean', description: 'Payday regime: true if a disqualifying ATO assessment or estimate applies (removes 20-point uplift reduction); false when omitted.' },
      voluntaryDisclosureDate: text('date', 'Payday regime: date an approved voluntary disclosure statement was lodged before assessmentDate, YYYY-MM-DD; omit when none.'),
      assumedGicRate: text('percent', 'Payday regime: assumed annual GIC rate in per cent (0.01 to 100) for days after 2026-12-31; required when notional earnings accrue after 2026-12-31.'),
      incomeYear: choice(['2022-23', '2023-24', '2024-25', '2025-26'], 'Quarter regime: income year of the quarter.'),
      quarter: choice(['1', '2', '3', '4'], 'Quarter regime: "1" (Jul-Sep), "2" (Oct-Dec), "3" (Jan-Mar) or "4" (Apr-Jun).'),
      salaryOrWages: text('cost', 'Quarter regime: salary or wages for the quarter in AUD.'),
      ordinaryTimeEarnings: text('cost', 'Quarter regime: ordinary time earnings for the quarter in AUD.'),
      contributionsOnTime: text('cost', 'Quarter regime: contributions made within 28 days of quarter end in AUD; "0" when omitted.'),
      statementLodgedDate: text('date', 'Quarter regime: date the SGC statement was or will be lodged, YYYY-MM-DD.'),
    }, ['regime']),
    run(input) {
      if (input.norfolkIsland === true) {
        throw new Error('Norfolk Island salary or wages have a lower transitional super guarantee rate '
          + '(7% to 10% for 2022-23 to 2025-26, 11% for 2026-27), which this calculator does not apply.');
      }
      checkModeFields(input, input.regime, SGC_ALLOWED, SGC_REQUIRED, SGC_COMMON);
      const source = `${CALCULATORS}sgc-payday/`;
      return input.regime === 'payday'
        ? runSgcPayday(input, calculate.paydaySuperCharge, dollars, source)
        : runSgcQuarter(input, calculate.quarterlySgCharge, dollars, source);
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['staffCost']} staffCost */
export function staffCostTool(kit, staffCost) {
  const { text, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_staff_cost',
    title: 'Staff cost calculator',
    description: 'Annual and monthly average cost in AUD of one staff member from annual wages, a supplied annual super '
      + 'amount and other annual on-costs (rounded half up to the cent for the monthly average). Does not compute super '
      + 'guarantee, payroll tax or award pay.',
    inputSchema: record({
      wages: text('cost', 'Annual wages in AUD with at most 2 decimal places, up to 1,000,000,000.'),
      superAmount: text('cost', 'Supplied annual super amount in AUD with at most 2 decimal places; "0" when omitted.'),
      otherCosts: text('cost', 'Other annual staff costs in AUD with at most 2 decimal places; "0" when omitted.'),
    }, ['wages']),
    run({ wages, superAmount = '0', otherCosts = '0' }) {
      const r = staffCost(wages, superAmount, otherCosts);
      return {
        annualCost: dollars(r.annual),
        monthlyAverage: dollars(r.monthly),
        currency: 'AUD',
        source: `${CALCULATORS}staff/`,
      };
    },
  });
}
