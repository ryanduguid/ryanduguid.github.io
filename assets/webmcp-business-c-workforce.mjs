// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for Business Calculators Cohort C (super lump sum tax,
// unused leave on termination and workers compensation premium) plus shared
// validation helpers. Imported by assets/webmcp-business-c.mjs and
// assets/webmcp-business-c-rental.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

const SBT_COMMON = new Set(['calculation', 'incomeYear', 'scopeConfirmed']);
const SBT_TAX_KEYS = [
  'paymentDate', 'recipient', 'benefit', 'interestValue', 'interestTaxFreeComponent', 'untaxedElement',
  'serviceBeforeJuly1983', 'dateOfBirth', 'terminalMedicalCondition', 'disabilitySuperannuationBenefit',
  'lowRateCapUsed', 'untaxedPlanCapUsed', 'otherLumpSumsThisYear',
];
const SBT_ALLOWED = new Map([
  ['tax', new Set(SBT_TAX_KEYS)],
  ['withholding', new Set([...SBT_TAX_KEYS, 'tfnProvided', 'foreignResident'])],
  ['dasp', new Set([
    'taxFreeComponent', 'taxedElement', 'untaxedElement', 'workingHolidayMakerContributions', 'unclaimedMoneyRollover',
  ])],
]);
const SBT_REQUIRED = new Map([
  ['tax', ['paymentDate', 'recipient', 'benefit', 'interestValue', 'interestTaxFreeComponent']],
  ['withholding', ['paymentDate', 'recipient', 'benefit', 'interestValue', 'interestTaxFreeComponent', 'tfnProvided', 'foreignResident']],
  ['dasp', ['taxFreeComponent', 'taxedElement', 'workingHolidayMakerContributions', 'unclaimedMoneyRollover']],
]);
const SBT_OPTIONAL_MAP = [
  ['serviceBeforeJuly1983', 'service_before_july_1983'],
  ['dateOfBirth', 'date_of_birth'],
  ['terminalMedicalCondition', 'terminal_medical_condition'],
  ['disabilitySuperannuationBenefit', 'disability_superannuation_benefit'],
  ['lowRateCapUsed', 'low_rate_cap_used'],
  ['untaxedPlanCapUsed', 'untaxed_plan_cap_used'],
  ['otherLumpSumsThisYear', 'other_lump_sums_this_year'],
];

const WC_COMMON = new Set(['place', 'estimatedWages', 'ratePercent', 'actualWages', 'groupedEmployer']);
const WC_ALLOWED = new Map([
  ['AU-NSW', new Set(['apprenticeWages', 'nswDustDiseasesRatePercent', 'nswSafeEmployerRewardPercent'])],
  ['AU-VIC', new Set(['vicEmployerType', 'vicDaysRegistered', 'vicExcessBuyout'])],
  ['AU-QLD', new Set(['apprenticeWages', 'qldPolicyStart'])],
  ['AU-SA', new Set(['apprenticeWages', 'saFirstFullYear', 'saClaimsCosts'])],
  ['AU-WA', new Set()],
  ['AU-TAS', new Set()],
  ['AU-ACT', new Set()],
  ['AU-NT', new Set()],
]);
const WC_REQUIRED = new Map([
  ['AU-NSW', ['nswDustDiseasesRatePercent']],
  ['AU-VIC', ['vicEmployerType']],
  ['AU-QLD', ['qldPolicyStart']],
  ['AU-SA', ['saFirstFullYear']],
  ['AU-WA', []],
  ['AU-TAS', []],
  ['AU-ACT', []],
  ['AU-NT', []],
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

/**
 * Requires `value` when `needed` is true and refuses it when `needed` is false.
 * @param {boolean} needed
 * @param {unknown} value
 * @param {string} fieldName
 * @param {string} reason
 */
export function requireWhen(needed, value, fieldName, reason) {
  if (needed && value === undefined) throw new Error(`${fieldName} is required ${reason}.`);
  if (!needed && value !== undefined) throw new Error(`${fieldName} applies only ${reason}.`);
}

/** @param {Record<string, any>} input @param {boolean} withPayee */
function buildSbtEngineInput(input, withPayee) {
  const { scopeConfirmed = true, untaxedElement = '0' } = input;
  const supplied = new Map(Object.entries(input));
  /** @type {Map<string, unknown>} */
  const out = new Map([
    ['year', input.incomeYear],
    ['scope_confirmed', scopeConfirmed],
    ['payment_date', input.paymentDate],
    ['recipient', input.recipient],
    ['benefit', input.benefit],
    ['interest_value', input.interestValue],
    ['interest_tax_free_component', input.interestTaxFreeComponent],
    ['untaxed_element', untaxedElement],
  ]);
  if (withPayee) {
    out.set('tfn_provided', input.tfnProvided);
    out.set('foreign_resident', input.foreignResident);
  }
  for (const [camel, snake] of SBT_OPTIONAL_MAP) {
    const val = supplied.get(camel);
    if (val !== undefined) out.set(snake, val);
  }
  return Object.fromEntries(out);
}

/**
 * @param {Record<string, any>} input
 * @param {Pick<BusinessCalculators, 'superBenefitTax' | 'superWithholding' | 'daspTax'>} engines
 * @param {(value: number) => string} dollars
 * @param {string} source
 */
function runSuperBenefitMode(input, { superBenefitTax, superWithholding, daspTax }, dollars, source) {
  const { scopeConfirmed = true, untaxedElement = '0' } = input;
  if (input.calculation === 'dasp') {
    const r = daspTax({
      year: input.incomeYear,
      scope_confirmed: scopeConfirmed,
      tax_free_component: input.taxFreeComponent,
      taxed_element: input.taxedElement,
      untaxed_element: untaxedElement,
      working_holiday_maker_contributions: input.workingHolidayMakerContributions,
      unclaimed_money_rollover: input.unclaimedMoneyRollover,
    });
    return {
      calculation: 'dasp', incomeYear: input.incomeYear, rateBasis: r.rateBasis,
      payment: dollars(r.payment), taxFreeTax: dollars(r.taxFreeTax), taxedElementTax: dollars(r.taxedTax),
      untaxedElementTax: dollars(r.untaxedTax), totalTax: dollars(r.tax), netPayment: dollars(r.net),
      rates: r.rates, currency: 'AUD', source,
    };
  }
  if (input.calculation === 'withholding') {
    const r = superWithholding(buildSbtEngineInput(input, true));
    return {
      calculation: 'withholding', incomeYear: input.incomeYear, treatment: r.treatment,
      taxFreeComponent: dollars(r.taxFree), taxableComponent: dollars(r.taxable),
      taxedElement: dollars(r.taxed), untaxedElement: dollars(r.untaxed),
      amounts: r.amounts, rates: r.rates, withholding: dollars(r.withholding),
      ...(r.age === undefined ? {} : { age: r.age, preservationAge: r.preservationAge }),
      currency: 'AUD', source,
    };
  }
  const r = superBenefitTax(buildSbtEngineInput(input, false));
  return {
    calculation: 'tax', incomeYear: input.incomeYear, treatment: r.treatment,
    taxFreeComponent: dollars(r.taxFree), taxableComponent: dollars(r.taxable),
    taxedElement: dollars(r.taxed), untaxedElement: dollars(r.untaxed),
    parts: r.parts.map((p) => ({
      id: p.id, amount: dollars(p.amount), ceilingRatePercent: p.rate, maximumTax: dollars(p.tax),
    })),
    caps: Object.fromEntries(Object.entries(r.caps).map(([k, v]) => [k, dollars(v)])),
    rates: r.rates, assessableIncome: dollars(r.assessable), notAssessableIncome: dollars(r.notAssessable),
    maximumTax: dollars(r.maximumTax),
    ...(r.age === undefined ? {} : { age: r.age, preservationAge: r.preservationAge }),
    currency: 'AUD', source,
  };
}

/**
 * @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'superBenefitTax' | 'superWithholding' | 'daspTax' | 'SBT_YEARS' | 'DASP_YEARS' | 'SWH_FIRST_DAY'>} calculate
 */
export function superBenefitTaxTool(kit, calculate) {
  const { text, choice, record, tool, dollars, CALCULATORS } = kit;
  const allYears = Array.from(new Set([...calculate.SBT_YEARS, ...calculate.DASP_YEARS]));
  return tool({
    name: 'calculate_super_benefit_tax',
    title: 'Super lump sum tax calculator',
    description: 'Superannuation lump sum tax in AUD across 3 calculations for a complying fund: (1) "tax" (2020-21 to '
      + '2026-27) gives components (s 307-125) and maximum income tax before Medicare levy under ITAA 1997 Divisions 301-303 '
      + `with low rate and untaxed plan caps; (2) "withholding" (from ${calculate.SWH_FIRST_DAY} to 2027-06-30) gives PAYG `
      + 'withholding under Schedule 12 (including roll-overs and deceased estate trustees); (3) "dasp" (2025-26 to 2027-28) '
      + 'gives departing Australia superannuation payment final tax (35%/45% ordinary or 65% working holiday maker). Refuses '
      + 'fields belonging to another calculation, disability super benefits, pre-1 July 1983 untaxed service and other lump '
      + 'sums sharing an unused low rate cap.',
    inputSchema: record({
      calculation: choice(['tax', 'withholding', 'dasp'], '"tax" (maximum income tax), "withholding" (Schedule 12) or "dasp" (departing Australia super payment).'),
      incomeYear: choice(allYears, 'Income year ("2020-21" to "2026-27" for tax/withholding; "2025-26" to "2027-28" for dasp).'),
      scopeConfirmed: { type: 'boolean', description: 'Optional scope confirmation; false refuses.' },
      paymentDate: text('date', 'Tax or withholding: payment date as YYYY-MM-DD inside incomeYear.'),
      recipient: choice(['member', 'death_benefits_dependant', 'non_dependant', 'rollover', 'deceased_estate_trustee'],
        'Tax or withholding: benefit recipient ("rollover" and "deceased_estate_trustee" apply to withholding only).'),
      benefit: text('cost', 'Tax or withholding: lump sum payment in AUD, above zero.'),
      interestValue: text('cost', 'Tax or withholding: value of the super interest just before payment in AUD.'),
      interestTaxFreeComponent: text('cost', 'Tax or withholding: tax free component of the super interest in AUD.'),
      untaxedElement: text('cost', 'Element untaxed in the fund in AUD; "0" when omitted.'),
      serviceBeforeJuly1983: { type: 'boolean', description: 'Tax or withholding with untaxedElement > 0: true if from pre-1 July 1983 service (refused).' },
      dateOfBirth: text('date', 'Tax or withholding for member recipient: member date of birth, YYYY-MM-DD.'),
      terminalMedicalCondition: { type: 'boolean', description: 'Tax or withholding for member recipient: true when certified terminal medical condition (s 303-10).' },
      disabilitySuperannuationBenefit: { type: 'boolean', description: 'Tax or withholding for member recipient: true for disability super benefit (refused).' },
      lowRateCapUsed: text('cost', 'Tax or withholding (with TFN) for member aged preservation age to 59: earlier low rate cap used in AUD.'),
      otherLumpSumsThisYear: { type: 'boolean', description: 'Tax or withholding (with TFN) for member aged preservation age to 59: true if other lump sums received this year.' },
      untaxedPlanCapUsed: text('cost', 'Tax or withholding with untaxedElement > 0 (member or rollover): earlier untaxed plan cap used from this plan in AUD.'),
      tfnProvided: { type: 'boolean', description: 'Withholding only: true when payee gave the fund a TFN.' },
      foreignResident: { type: 'boolean', description: 'Withholding only: true when payee is a foreign resident.' },
      taxFreeComponent: text('cost', 'DASP only: tax free component of the payment in AUD.'),
      taxedElement: text('cost', 'DASP only: element taxed in the fund in AUD.'),
      workingHolidayMakerContributions: { type: 'boolean', description: 'DASP only: true when payment includes contributions made whilst a working holiday maker (65% rate).' },
      unclaimedMoneyRollover: { type: 'boolean', description: 'DASP only: true if an unclaimed money roll-over (refused when untaxedElement > 0).' },
    }, ['calculation', 'incomeYear']),
    run(input) {
      checkModeFields(input, input.calculation, SBT_ALLOWED, SBT_REQUIRED, SBT_COMMON);
      return runSuperBenefitMode(input, calculate, dollars, `${CALCULATORS}super-benefit-tax/`);
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['unusedLeave']} unusedLeave */
export function unusedLeaveTool(kit, unusedLeave) {
  const { text, choice, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_unused_leave_withholding',
    title: 'Unused leave on termination calculator',
    description: 'PAYG withholding in AUD under ATO Schedule 7 (2026-27) and STP Phase 2 reporting labels (lump sum A type '
      + 'R or T, lump sum B and paid leave type U) for one employee\'s unused annual leave, leave loading and long service '
      + 'leave paid on termination (ITAA 1997 ss 83-10 to 83-90). Uses Schedule 1 scale 2 or 3 for the marginal rate '
      + 'calculation when a TFN is provided, or 47% (45% foreign resident) without a TFN. Does not cover death benefits, '
      + 'working holiday makers (Schedule 15) or splitting leave across accrual periods by days of service.',
    inputSchema: record({
      annualLeave: text('cost', 'Unused annual leave paid in AUD; "0" when omitted.'),
      leaveLoading: text('cost', 'Leave loading on unused annual leave in AUD; "0" when omitted.'),
      longServiceLeave: text('cost', 'Unused long service leave paid in AUD; "0" when omitted.'),
      accrualStartDate: text('date', 'Date the leave began to accrue, YYYY-MM-DD, from 1900-01-01 to 2027-06-30.'),
      reason: choice(['normal', 'genuine-redundancy', 'early-retirement', 'invalidity'], 'Why employment ended.'),
      annualBefore18August1993: text('cost', 'Annual leave for employment before 18 August 1993 in AUD; omit when not applicable.'),
      loadingBefore18August1993: text('cost', 'Leave loading for employment before 18 August 1993 in AUD; omit when not applicable.'),
      lslBefore16August1978: text('cost', 'Long service leave for period before 16 August 1978 in AUD; omit when not applicable.'),
      lsl16August1978To17August1993: text('cost', 'Long service leave for 16 August 1978 to 17 August 1993 in AUD; omit when not applicable.'),
      payee: choice(['tfn', 'tfn-foreign', 'no-tfn', 'no-tfn-foreign'], '"tfn" (scale 2), "tfn-foreign" (scale 3), "no-tfn" or "no-tfn-foreign".'),
      normalGrossEarnings: text('cost', 'Required when a TFN is provided: normal gross earnings for one pay period in AUD.'),
      payPeriod: choice(['week', 'fortnight', 'month'], 'Required when a TFN is provided: "week", "fortnight" or "month".'),
    }, ['accrualStartDate', 'reason', 'payee']),
    run({
      annualLeave = '0', leaveLoading = '0', longServiceLeave = '0', accrualStartDate, reason,
      annualBefore18August1993 = '', loadingBefore18August1993 = '', lslBefore16August1978 = '',
      lsl16August1978To17August1993 = '', payee, normalGrossEarnings, payPeriod,
    }) {
      const hasTfn = payee === 'tfn' || payee === 'tfn-foreign';
      requireWhen(hasTfn, normalGrossEarnings, 'normalGrossEarnings', 'when a TFN is provided');
      requireWhen(hasTfn, payPeriod, 'payPeriod', 'when a TFN is provided');
      const r = unusedLeave({
        annual: annualLeave, loading: leaveLoading, longService: longServiceLeave, accrualStart: accrualStartDate,
        reason, annualBefore1993: annualBefore18August1993, loadingBefore1993: loadingBefore18August1993,
        lslBefore1978: lslBefore16August1978, lsl1978To1993: lsl16August1978To17August1993, payee,
        earnings: normalGrossEarnings ?? '0', period: payPeriod ?? 'week',
      });
      return {
        annualCapped: dollars(r.annualCapped),
        annualMarginal: dollars(r.annualMarginal),
        lslPre1978: dollars(r.lslPre1978),
        lslPre1978Assessable: dollars(r.lslPre1978Assessable),
        lslPre1978NotAssessable: dollars(r.lslPre1978NotAssessable),
        lslCapped: dollars(r.lslCapped),
        lslMarginal: dollars(r.lslMarginal),
        assessableIncome: dollars(r.assessable),
        cappedAt30Percent: dollars(r.capped),
        marginalRateAmount: dollars(r.marginalAmount),
        flatWithholding: r.flat === null ? null : dollars(r.flat),
        marginalWorking: r.marginal ? {
          withheldOnNormalEarnings: dollars(r.marginal.onEarnings),
          leaveSharePerPay: dollars(r.marginal.share),
          withheldWithLeaveShare: dollars(r.marginal.withShare),
          beforeUnder300Limit: dollars(r.marginal.beforeLimit),
          under300LimitApplied: r.marginal.limited,
          payPeriodsPerYear: r.marginal.periods,
        } : null,
        marginalWithholding: r.marginalWithheld === null ? null : dollars(r.marginalWithheld),
        noTfnRatePercent: r.noTfnRate,
        totalWithholding: dollars(r.withholding),
        lumpSumA: dollars(r.lumpSumA),
        lumpSumAType: r.lumpSumAType,
        lumpSumB: dollars(r.lumpSumB),
        paidLeaveTypeU: dollars(r.unusedLeave),
        currency: 'AUD',
        source: `${CALCULATORS}unused-leave/`,
      };
    },
  });
}

/** @param {Record<string, any>} input @returns {import('./workers-compensation.mjs').WcInput} */
function buildWcInput(input) {
  checkModeFields(input, input.place, WC_ALLOWED, WC_REQUIRED, WC_COMMON);
  if (input.place === 'AU-SA' && input.saFirstFullYear === true && input.saClaimsCosts !== undefined) {
    throw new Error('saClaimsCosts does not apply in the employer\'s first full financial year registered.');
  }
  const {
    apprenticeWages = '0', actualWages = '', nswDustDiseasesRatePercent = '', nswSafeEmployerRewardPercent = '0',
    vicEmployerType = 'new', vicDaysRegistered = 365, qldPolicyStart = 'q1', saClaimsCosts = '0',
  } = input;
  return {
    place: input.place,
    wages: input.estimatedWages,
    rate: input.ratePercent,
    apprentice: apprenticeWages,
    actual: actualWages,
    group: input.groupedEmployer === true ? 'yes' : 'no',
    dust: nswDustDiseasesRatePercent,
    reward: nswSafeEmployerRewardPercent,
    vicEmployer: vicEmployerType,
    days: String(vicDaysRegistered),
    buyout: input.vicExcessBuyout === true ? 'yes' : 'no',
    qldStart: qldPolicyStart,
    firstYear: input.saFirstFullYear === true ? 'yes' : 'no',
    claims: saClaimsCosts,
  };
}

/**
 * @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'workersCompensation' | 'WC_SCHEMES'>} calculate
 */
export function workersCompensationTool(kit, calculate) {
  const { text, choice, whole, record, tool, dollars, centsText, CALCULATORS } = kit;
  return tool({
    name: 'calculate_workers_compensation_premium',
    title: 'Workers compensation premium calculator',
    description: '2026-27 workers compensation premium estimate in AUD under any of the 8 Australian state and territory '
      + 'schemes from declared wages and the insurer-supplied industry or premium rate, with GST, Queensland 5% insurance '
      + 'duty and optional actual-wages adjustment. Applies small-employer methods for NSW (icare), Victoria (WorkSafe new '
      + 'or small), Queensland (new 2026-27 policy) and South Australia (ReturnToWorkSA), and rate times wages plus GST for '
      + 'WA, Tasmania, ACT and NT. Holds no rate table and refuses grouped employers in statutory schemes, experience-rated '
      + 'premiums, fields belonging to another scheme and other policy years.',
    inputSchema: record({
      place: choice(Object.keys(calculate.WC_SCHEMES), 'State or territory scheme, for example "AU-NT" or "AU-NSW".'),
      estimatedWages: text('cost', 'Estimated wages for the 2026-27 policy period in AUD.'),
      ratePercent: text('rate', 'Insurer industry or premium rate in per cent (0.0001 to 100, up to 4 decimal places).'),
      actualWages: text('cost', 'Optional actual wages for the policy period in AUD, to calculate the adjustment.'),
      groupedEmployer: { type: 'boolean', description: 'true when a member of a group of employers (refused in NSW, Vic, Qld and SA); false when omitted.' },
      apprenticeWages: text('cost', 'NSW, Qld or SA only: qualifying apprentice wages included in estimatedWages in AUD; "0" when omitted.'),
      nswDustDiseasesRatePercent: text('rate', 'NSW only: dust diseases rate for your WIC including GST (0 to 10%).'),
      nswSafeEmployerRewardPercent: text('rate', 'NSW only: Safe Employer Reward percentage (0 to 100%); "0" when omitted.'),
      vicEmployerType: choice(['new', 'small', 'other'], 'Victoria only: "new", "small" (<= $200,000) or "other" (refused).'),
      vicDaysRegistered: whole(1, 365, 'Victoria only: days registered in 2026-27 (1 to 365); 365 when omitted.'),
      vicExcessBuyout: { type: 'boolean', description: 'Victoria only: true when the excess is bought out (+10%); false when omitted.' },
      qldPolicyStart: choice(['q1', 'q2', 'q3', 'q4', 'existing'], 'Queensland only: policy start quarter in 2026-27 ("q1" to "q4") or "existing" (refused).'),
      saFirstFullYear: { type: 'boolean', description: 'South Australia only: true for the employer\'s first full financial year registered.' },
      saClaimsCosts: text('cost', 'South Australia (when saFirstFullYear is false): claims costs in AUD; "0" when omitted.'),
    }, ['place', 'estimatedWages', 'ratePercent']),
    run(input) {
      const r = calculate.workersCompensation(buildWcInput(input));
      return {
        policyYear: '2026-27',
        place: input.place,
        estimatedWages: dollars(r.wages),
        actualWages: r.actualWages === null ? null : dollars(r.actualWages),
        apprenticeWages: dollars(r.apprentice),
        claimsCosts: dollars(r.claims),
        premiumBeforeGst: dollars(r.premium),
        gst: dollars(r.gst),
        insuranceDuty: dollars(r.duty),
        estimatedTotal: dollars(r.total),
        actualTotal: r.actualTotal === null ? null : dollars(r.actualTotal),
        adjustment: r.adjustment === null ? null : dollars(r.adjustment),
        lines: r.lines.map(([label, amountCents]) => ({ label, amount: centsText(amountCents) })),
        notes: r.notes,
        currency: 'AUD',
        source: `${CALCULATORS}workers-compensation/`,
      };
    },
  });
}
